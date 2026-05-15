"use server";

import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import baseUrl from "@/lib/baseUrl";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function createChapaCheckoutSession({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  // 1. Get the authenticated user identity and full profile
  const user = await currentUser();
  // 2. Extract the details for Chapa
  const firstName = user?.firstName ?? "Guest";
  const lastName = user?.lastName ?? "User";
  const email = user?.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress ?? "";

  const convex = getConvexClient();

  // 1. Get event details
  const event = await convex.query(api.events.getById, { eventId });
  if (!event) throw new Error("Event not found");

  // 2. Get waiting list entry/queue position
  const queuePosition = await convex.query(api.waitingList.getQueuePosition, {
    eventId,
    userId,
  });

  if (!queuePosition || queuePosition.status !== "offered") {
    throw new Error("No valid ticket offer found");
  }

  if (!queuePosition.offerExpiresAt) {
    throw new Error("Ticket offer has no expiration date");
  }

  // 3. Prepare Chapa Request
  // tx_ref must be unique for every attempt. Using waitingListId + timestamp is safe.
  const tx_ref = `tx-${queuePosition._id}-${Date.now()}`;

  const response = await fetch("https://api.chapa.co/v1/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: event.price.toString(),
      currency: "ETB", // Chapa defaults to ETB
      email: email, // Ideally fetch this from Clerk/Convex
      first_name: firstName,    // Ideally fetch from Clerk
      last_name: lastName,     // Ideally fetch from Clerk
      tx_ref: tx_ref,
      callback_url: `${baseUrl}/api/webhooks/chapa`, // Your webhook handler
      return_url: `${baseUrl}/tickets/purchase-success`, // Where to send users after payment
      "customization[title]": event.name,
      "customization[description]": event.description || "Ticket Purchase",
      // Metadata to identify the purchase in your webhook
      "meta": {
        "eventId": eventId,
        "userId": userId,
        "waitingListId": queuePosition._id
}
    }),
  });

  const result = await response.json();

  if (result.status !== "success") {
    throw new Error(result.message || "Chapa initialization failed");
  }

  return { sessionUrl: result.data.checkout_url };
}
