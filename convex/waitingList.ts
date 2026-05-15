import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { DURATIONS, WAITING_LIST_STATUS, TICKET_STATUS } from "./constants";
import { internal } from "./_generated/api";
import { MutationCtx } from "./_generated/server";

/**
 * Helper function to group waiting list entries by event ID.
 * Used for batch processing expired offers by event.
 */
function groupByEvent(
  offers: Array<{ eventId: Id<"events">; _id: Id<"waitingList"> }>
) {
  return offers.reduce(
    (acc, offer) => {
      const eventId = offer.eventId;
      if (!acc[eventId]) {
        acc[eventId] = [];
      }
      acc[eventId].push(offer);
      return acc;
    },
    {} as Record<Id<"events">, typeof offers>
  );
}

/**
 * Query to get a user's current position in the waiting list for an event.
 * Returns null if user is not in queue, otherwise returns their entry with position.
 */
export const getQueuePosition = query({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  handler: async (ctx, { eventId, userId }) => {
    // Get entry for this specific user and event combination
    const entry = await ctx.db
      .query("waitingList")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", eventId)
      )
      .filter((q) => q.neq(q.field("status"), WAITING_LIST_STATUS.EXPIRED))
      .first();

    if (!entry) return null;

    // Get total number of people ahead in line
    const peopleAhead = await ctx.db
      .query("waitingList")
      .withIndex("by_event_status", (q) => q.eq("eventId", eventId))
      .filter((q) =>
        q.and(
          q.lt(q.field("_creationTime"), entry._creationTime),
          q.or(
            q.eq(q.field("status"), WAITING_LIST_STATUS.WAITING),
            q.eq(q.field("status"), WAITING_LIST_STATUS.OFFERED)
          )
        )
      )
      .collect()
      .then((entries) => entries.length);

    return {
      ...entry,
      position: peopleAhead + 1,
    };
  },
});

/**
 * Mutation to process the waiting list queue and offer tickets to next eligible users.
 * Checks current availability considering purchased tickets and active offers.
 */
export async function processQueueInternal(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");

  // Fetch ticket count using index matching
  const purchasedCount = await ctx.db
    .query("tickets")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect()
    .then(
      (tickets) =>
        tickets.filter(
          (t) =>
            t.status === TICKET_STATUS.VALID ||
            t.status === TICKET_STATUS.USED
        ).length
    );

  const now = Date.now();

  // Fetch active time-sensitive offers
  const activeOffers = await ctx.db
    .query("waitingList")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.OFFERED)
    )
    .collect()
    .then(
      (entries) =>
        entries.filter((e) => (e.offerExpiresAt ?? 0) > now).length
    );

  // Calculate remaining slot count
  const availableSpots = event.totalTickets - (purchasedCount + activeOffers);
  if (availableSpots <= 0) return;

  // Retrieve matching queue pool based on priority order
  const waitingUsers = await ctx.db
    .query("waitingList")
    .withIndex("by_event_status", (q) =>
      q.eq("eventId", eventId).eq("status", WAITING_LIST_STATUS.WAITING)
    )
    .order("asc")
    .take(availableSpots);

  // Process status upgrades and schedule expiration checks
  for (const user of waitingUsers) {
    await ctx.db.patch(user._id, {
      status: WAITING_LIST_STATUS.OFFERED,
      offerExpiresAt: now + DURATIONS.TICKET_OFFER,
    });

    await ctx.scheduler.runAfter(
      DURATIONS.TICKET_OFFER,
      internal.waitingList.expireOffer,
      {
        waitingListId: user._id,
        eventId,
      }
    );
  }
}

/**
 * Internal mutation to expire a single offer and process queue for next person.
 * Called by scheduled job when offer timer expires.
 */
export const expireOffer = internalMutation({
  args: {
    waitingListId: v.id("waitingList"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { waitingListId, eventId }) => {
    const offer = await ctx.db.get(waitingListId);
    if (!offer || offer.status !== WAITING_LIST_STATUS.OFFERED) return;

    await ctx.db.patch(waitingListId, {
      status: WAITING_LIST_STATUS.EXPIRED,
    });

    // Execute within the exact same atomic database transaction block
    await processQueueInternal(ctx, eventId);
  },
});

export const processQueue = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, { eventId }) => {
    await processQueueInternal(ctx, eventId);
  },
});

/**
 * Periodic cleanup job that acts as a fail-safe for expired offers.
 * While individual offers should expire via scheduled jobs (expireOffer),
 * this ensures any offers that weren't properly expired (e.g. due to server issues)
 * are caught and cleaned up. Also helps maintain data consistency.
 *
 * Groups expired offers by event for efficient processing and updates queue
 * for each affected event after cleanup.
 */
export const cleanupExpiredOffers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Fetch all events to scope your lookup queries safely
    const events = await ctx.db.query("events").collect();

    for (const event of events) {
      // 2. Use your existing compound index to pull only OFFERED statuses for this event
      const expiredOffers = await ctx.db
        .query("waitingList")
        .withIndex("by_event_status", (q) =>
          q.eq("eventId", event._id).eq("status", WAITING_LIST_STATUS.OFFERED)
        )
        .collect()
        .then((entries) =>
          entries.filter((e) => (e.offerExpiresAt ?? 0) < now)
        );

      // Skip processing if this specific event has no expired positions
      if (expiredOffers.length === 0) continue;

      // 3. Perform atomic batch updates within the transaction loop
      await Promise.all(
        expiredOffers.map((offer) =>
          ctx.db.patch(offer._id, {
            status: WAITING_LIST_STATUS.EXPIRED,
          })
        )
      );

      // 4. Safely trigger your shared queue runner using the Internal Context
      await processQueueInternal(ctx, event._id);
    }
  },
});


export const releaseTicket = mutation({
  args: {
    eventId: v.id("events"),
    waitingListId: v.id("waitingList"),
  },
  handler: async (ctx, { eventId, waitingListId }) => {
    const entry = await ctx.db.get(waitingListId);
    if (!entry || entry.status !== WAITING_LIST_STATUS.OFFERED) {
      throw new Error("No valid ticket offer found");
    }

    // Mark the entry as expired safely within this transaction
    await ctx.db.patch(waitingListId, {
      status: WAITING_LIST_STATUS.EXPIRED,
    });

    // Process the queue to offer the ticket to the next person automatically
    await processQueueInternal(ctx, eventId);
  },
});
