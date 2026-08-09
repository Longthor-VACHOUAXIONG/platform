import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './firebaseAdmin';
import { sendPushToTokens } from './rideMatching';

/**
 * Notifies the driver of a new chat message from the rider. Only pushes to
 * the driver, not the rider — the rider app doesn't have FCM wired up yet
 * (see README "Still not done"), so a rider-side message only shows up live
 * while they have the chat screen open. Add rider push the same way the
 * driver app registers a token, then mirror this for the other direction.
 */
export const onChatMessageCreated = onDocumentCreated(
  'rideRequests/{rideId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message || message.senderRole !== 'rider') return;

    const rideDoc = await db.collection('rideRequests').doc(event.params.rideId).get();
    const ride = rideDoc.data();
    if (!ride?.assignedDriverId) return;

    const driverDoc = await db.collection('drivers').doc(ride.assignedDriverId).get();
    const pushToken = driverDoc.data()?.pushToken;
    if (!pushToken) return;

    await sendPushToTokens([pushToken], {
      title: ride.riderName ?? 'New message',
      body: message.text,
      data: { type: 'chat_message', rideId: event.params.rideId },
    });
  }
);
