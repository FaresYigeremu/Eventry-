import { headers } from "next/headers";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  
  // 1. Get both possible signature headers
  const chapaSignature = headersList.get("chapa-signature"); // Should match "Eventry"
  const xChapaSignature = headersList.get("x-chapa-signature"); // HMAC of body
  
  const secretKey = process.env.CHAPA_SECRET_KEY!;
  const secretHash = process.env.CHAPA_WEBHOOK_SECRET_HASH!; // Set this to "Eventry" in .env

  // 2. Validation Logic
  // We verify using the payload hash (x-chapa-signature) for maximum security
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(body)
    .digest("hex");

  const isXValid = xChapaSignature === expectedHash;
  const isHashValid = chapaSignature === secretHash;

  if (!isXValid && !isHashValid) {
    console.error("Webhook validation failed. Neither signature nor hash matched.");
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(body);
  const convex = getConvexClient();

  // 3. Process the Event
  if (payload.event === "charge.success") {
    // Extract metadata you sent during initialization
    const { eventId, userId, waitingListId } = payload.meta || {};

    try {
      await convex.mutation(api.events.purchaseTicket, {
        eventId,
        userId,
        waitingListId,
        paymentInfo: {
          paymentIntentId: payload.reference,
          amount: parseFloat(payload.amount),
        },
      });
      
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Convex Mutation Error:", error);
      return new Response("Mutation Failed", { status: 500 });
    }
  }

  return new Response("Event not handled", { status: 200 });
}