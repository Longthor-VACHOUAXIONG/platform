import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';

/**
 * Rider rates their driver, or driver rates their rider, after a completed
 * trip. Each party can only rate once per ride (enforced by using their uid
 * as the rating doc's ID — a second call just overwrites their own rating,
 * it can't be spoofed as someone else's).
 */
export const submitRating = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, rating, comment } = request.data as {
    rideId: string;
    rating: number;
    comment?: string;
  };
  if (!rideId || !rating || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'rideId and a rating from 1-5 are required.');
  }

  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride not found.');
  const ride = rideDoc.data()!;

  if (ride.status !== 'completed') {
    throw new HttpsError('failed-precondition', 'Can only rate a completed trip.');
  }

  let role: 'rider' | 'driver';
  let targetCollection: string;
  let targetId: string;

  if (ride.riderId === uid) {
    role = 'rider';
    targetCollection = 'drivers';
    targetId = ride.assignedDriverId;
  } else if (ride.assignedDriverId === uid) {
    role = 'driver';
    targetCollection = 'users';
    targetId = ride.riderId;
  } else {
    throw new HttpsError('permission-denied', 'You were not part of this trip.');
  }

  const ratingRef = rideRef.collection('ratings').doc(uid);
  const targetRef = db.collection(targetCollection).doc(targetId);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ratingRef);
    const targetDoc = await tx.get(targetRef);
    const target = targetDoc.data() ?? { rating: 5, ratingCount: 0 };

    let newSum = (target.rating ?? 5) * (target.ratingCount ?? 0);
    let newCount = target.ratingCount ?? 0;

    if (existing.exists) {
      // Replacing a previous rating from the same person — back out the old
      // value before adding the new one so the average stays correct.
      newSum -= existing.data()!.rating;
    } else {
      newCount += 1;
    }
    newSum += rating;

    tx.set(
      ratingRef,
      { raterId: uid, role, rating, comment: comment ?? null, createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.update(targetRef, {
      rating: newCount > 0 ? newSum / newCount : 5,
      ratingCount: newCount,
    });
  });

  return { ok: true };
});
