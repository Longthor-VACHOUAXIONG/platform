import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { sendPushToTokens } from './rideMatching';

/**
 * Sends a chat message on a ride. The old flow wrote the message directly
 * from the app and a Firestore trigger pushed the notification — on the VPS
 * (no triggers) this callable does both: write + push to the driver when the
 * rider is the sender (matching the trigger's behavior).
 */
export const sendChatMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, text } = request.data as { rideId: string; text: string };
  const trimmed = text?.trim();
  if (!rideId || !trimmed) throw new HttpsError('invalid-argument', 'rideId and text are required.');

  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride not found.');
  const ride = rideDoc.data()!;

  let senderRole: 'rider' | 'driver';
  if (ride.riderId === uid) {
    senderRole = 'rider';
  } else if (ride.assignedDriverId === uid) {
    senderRole = 'driver';
  } else {
    throw new HttpsError('permission-denied', 'You are not part of this ride.');
  }

  await rideRef.collection('messages').add({
    senderId: uid,
    senderRole,
    text: trimmed,
    // Marks this as server-created so the onChatMessageCreated trigger (if it
    // ever fires, e.g. an old app build writing directly) skips double-pushing.
    createdBy: 'callable',
    createdAt: FieldValue.serverTimestamp(),
  });

  if (senderRole === 'rider' && ride.assignedDriverId) {
    const driverDoc = await db.collection('drivers').doc(ride.assignedDriverId).get();
    const pushToken = driverDoc.data()?.pushToken;
    if (pushToken) {
      await sendPushToTokens([pushToken], {
        title: ride.riderName ?? 'New message',
        body: trimmed,
        data: { type: 'chat_message', rideId },
      });
    }
  }

  if (senderRole === 'driver') {
    const riderDoc = await db.collection('users').doc(ride.riderId).get();
    const pushToken = riderDoc.data()?.pushToken as string | undefined;
    if (pushToken) {
      const driverDoc = await db.collection('drivers').doc(uid).get();
      await sendPushToTokens([pushToken], {
        title: driverDoc.data()?.name ?? 'Your driver',
        body: trimmed,
        data: { type: 'chat_message', rideId },
      });
    }
  }

  return { ok: true };
});

/**
 * Pushes a notification for a new chat message: to the driver when the rider
 * sends, to the rider when the driver sends. (Rider pushes run through the
 * same `users/{uid}.pushToken` the rider app registers on sign-in.)
 *
 * Messages written by the `sendChatMessage` callable are already pushed
 * server-side (see `createdBy: 'callable'`), so this skips those.
 */
export const onChatMessageCreated = onDocumentCreated(
  'rideRequests/{rideId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message || message.createdBy === 'callable') return;

    const rideDoc = await db.collection('rideRequests').doc(event.params.rideId).get();
    const ride = rideDoc.data();
    if (!ride?.assignedDriverId) return;

    if (message.senderRole === 'rider') {
      const driverDoc = await db.collection('drivers').doc(ride.assignedDriverId).get();
      const pushToken = driverDoc.data()?.pushToken;
      if (!pushToken) return;
      await sendPushToTokens([pushToken], {
        title: ride.riderName ?? 'New message',
        body: message.text,
        data: { type: 'chat_message', rideId: event.params.rideId },
      });
    } else if (message.senderRole === 'driver') {
      const riderDoc = await db.collection('users').doc(ride.riderId).get();
      const pushToken = riderDoc.data()?.pushToken as string | undefined;
      if (!pushToken) return;
      const driverDoc = await db.collection('drivers').doc(ride.assignedDriverId).get();
      await sendPushToTokens([pushToken], {
        title: driverDoc.data()?.name ?? 'Your driver',
        body: message.text,
        data: { type: 'chat_message', rideId: event.params.rideId },
      });
    }
  }
);
