import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { sendPushToTokens } from './rideMatching';
import { txRecordCompletedRide } from './analytics';

/** Driver registers their FCM push token so they can be notified of new nearby requests. */
export const registerPushToken = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { pushToken } = request.data as { pushToken: string };
  if (!pushToken) throw new HttpsError('invalid-argument', 'pushToken is required.');

  await db.collection('drivers').doc(uid).update({ pushToken });
  return { ok: true };
});

/** Rider registers their FCM push token (stored on `users/{uid}` so riders get
 * pushes for chat/trip events while their app is backgrounded). */
export const registerRiderPushToken = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { pushToken } = request.data as { pushToken: string };
  if (!pushToken) throw new HttpsError('invalid-argument', 'pushToken is required.');

  // Merge so we don't clobber any existing rider profile fields; creates the
  // doc if the rider hasn't been written to `users` yet.
  await db.collection('users').doc(uid).set({ pushToken }, { merge: true });
  return { ok: true };
});

/** Fetches a rider's push token from `users/{riderId}`. */
async function getRiderPushToken(riderId: string): Promise<string | undefined> {
  const riderDoc = await db.collection('users').doc(riderId).get();
  return riderDoc.data()?.pushToken as string | undefined;
}

/** Driver submits a fare offer on an open ride request. */
export const submitOffer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, offeredFare, etaMinutes } = request.data as {
    rideId: string;
    offeredFare: number;
    etaMinutes: number;
  };
  if (!rideId || typeof offeredFare !== 'number' || !Number.isFinite(offeredFare) || offeredFare <= 0) {
    throw new HttpsError('invalid-argument', 'rideId and a positive offeredFare are required.');
  }
  if (offeredFare > 50_000_000) {
    throw new HttpsError('invalid-argument', 'offeredFare is unrealistically high.');
  }

  const driverDoc = await db.collection('drivers').doc(uid).get();
  if (!driverDoc.exists) throw new HttpsError('permission-denied', 'Driver profile not found.');
  const driver = driverDoc.data()!;
  if (driver.verificationStatus !== 'approved') {
    throw new HttpsError('permission-denied', 'Driver is not approved yet.');
  }

  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
  const ride = rideDoc.data()!;
  if (ride.status !== 'searching' && ride.status !== 'offers_received') {
    throw new HttpsError('failed-precondition', 'This ride is no longer accepting offers.');
  }

  await rideRef.collection('offers').doc(uid).set({
    driverId: uid,
    driverName: driver.name,
    vehicleModel: driver.vehicleModel,
    rating: driver.rating ?? 5,
    totalRides: driver.totalRides ?? 0,
    offeredFare,
    etaMinutes: etaMinutes ?? 5,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });

  if (ride.status === 'searching') {
    await rideRef.update({ status: 'offers_received', updatedAt: FieldValue.serverTimestamp() });
  }

  return { ok: true };
});

/** Rider accepts a specific driver's offer. Declines all other pending offers. */export const acceptOffer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, driverId } = request.data as { rideId: string; driverId: string };
  if (!rideId || !driverId) {
    throw new HttpsError('invalid-argument', 'rideId and driverId are required.');
  }

  const rideRef = db.collection('rideRequests').doc(rideId);

  await db.runTransaction(async (tx) => {
    const rideDoc = await tx.get(rideRef);
    if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
    const ride = rideDoc.data()!;

    if (ride.riderId !== uid) {
      throw new HttpsError('permission-denied', 'Only the requesting rider can accept an offer.');
    }
    if (ride.status === 'driver_assigned' || ride.status === 'in_progress') {
      throw new HttpsError('failed-precondition', 'A driver is already assigned.');
    }

    const offerRef = rideRef.collection('offers').doc(driverId);
    const offerDoc = await tx.get(offerRef);
    if (!offerDoc.exists) throw new HttpsError('not-found', 'Offer not found.');
    const offer = offerDoc.data()!;

    tx.update(rideRef, {
      status: 'driver_assigned',
      assignedDriverId: driverId,
      assignedFare: offer.offeredFare,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(offerRef, { status: 'accepted' });

    // Decline all other pending offers on this ride.
    const otherOffers = await rideRef.collection('offers').where('status', '==', 'pending').get();
    otherOffers.forEach((doc) => {
      if (doc.id !== driverId) {
        tx.update(doc.ref, { status: 'declined_by_rider' });
      }
    });
  });

  // Notify the winning driver — this is how they find out while backgrounded.
  const driverDoc = await db.collection('drivers').doc(driverId).get();
  const pushToken = driverDoc.data()?.pushToken;
  if (pushToken) {
    await sendPushToTokens([pushToken], {
      title: "You've got a ride!",
      body: 'Tap to see pickup details.',
      data: { type: 'ride_assigned', rideId },
    });
  }

  return { ok: true };
});

/** Rider declines a specific driver's offer (e.g. fare too high), keeping the
 * ride searching so other drivers can still offer. */
export const declineOffer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, driverId } = request.data as { rideId: string; driverId: string };
  if (!rideId || !driverId) {
    throw new HttpsError('invalid-argument', 'rideId and driverId are required.');
  }

  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
  const ride = rideDoc.data()!;

  if (ride.riderId !== uid) {
    throw new HttpsError('permission-denied', 'Only the requesting rider can decline an offer.');
  }
  if (ride.status !== 'searching' && ride.status !== 'offers_received') {
    throw new HttpsError('failed-precondition', 'This ride is no longer accepting offers.');
  }

  const offerRef = rideRef.collection('offers').doc(driverId);
  await offerRef.update({ status: 'declined_by_rider' });

  return { ok: true };
});

/** Rider cancels an open (not yet in-progress) ride request. */
export const cancelRide = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId, reason } = request.data as { rideId: string; reason?: string };
  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
  const ride = rideDoc.data()!;

  if (ride.riderId !== uid) {
    throw new HttpsError('permission-denied', 'Only the requesting rider can cancel.');
  }
  if (ride.status === 'in_progress' || ride.status === 'completed') {
    throw new HttpsError('failed-precondition', 'Cannot cancel a trip already underway.');
  }

  await rideRef.update({
    status: 'cancelled',
    cancelReason: reason ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/** Driver marks an assigned trip as started. */
export const startTrip = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId } = request.data as { rideId: string };
  const rideRef = db.collection('rideRequests').doc(rideId);
  const rideDoc = await rideRef.get();
  if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
  const ride = rideDoc.data()!;

  if (ride.assignedDriverId !== uid) {
    throw new HttpsError('permission-denied', 'Only the assigned driver can start this trip.');
  }
  if (ride.status !== 'driver_assigned') {
    throw new HttpsError('failed-precondition', 'Trip must be assigned before it can start.');
  }

  await rideRef.update({ status: 'in_progress', updatedAt: FieldValue.serverTimestamp() });

  // Let the rider know their driver is on the way even if the app is
  // backgrounded (chat/trip pushes use the same `users/{uid}.pushToken`).
  const riderToken = await getRiderPushToken(ride.riderId);
  if (riderToken) {
    await sendPushToTokens([riderToken], {
      title: 'Trip started',
      body: 'Your driver is on the way.',
      data: { type: 'trip_started', rideId },
    });
  }

  return { ok: true };
});

const DEFAULT_COMMISSION_RATE = 0.1;

/** Driver marks the trip complete; increments their ride count and deducts commission from their wallet. */
export const completeTrip = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { rideId } = request.data as { rideId: string };
  const rideRef = db.collection('rideRequests').doc(rideId);
  const driverRef = db.collection('drivers').doc(uid);
  const configRef = db.collection('walletConfig').doc('default');

  let commissionDeducted = 0;

  await db.runTransaction(async (tx) => {
    const [rideDoc, driverDoc, configDoc] = await Promise.all([
      tx.get(rideRef),
      tx.get(driverRef),
      tx.get(configRef),
    ]);
    if (!rideDoc.exists) throw new HttpsError('not-found', 'Ride request not found.');
    const ride = rideDoc.data()!;

    if (ride.assignedDriverId !== uid) {
      throw new HttpsError('permission-denied', 'Only the assigned driver can complete this trip.');
    }
    // Hard state guard inside the transaction: a driver (or a modified
    // client replaying the call) can't complete a trip that isn't in
    // progress, so the commission can't be deducted twice and totalRides
    // can't be inflated by hammering this endpoint.
    if (ride.status !== 'in_progress') {
      throw new HttpsError('failed-precondition', 'Trip must be in progress to complete.');
    }

    const commissionRate = configDoc.data()?.commissionRate ?? DEFAULT_COMMISSION_RATE;
    const fare = ride.assignedFare ?? 0;
    commissionDeducted = Math.round(fare * commissionRate);
    const newBalance = (driverDoc.data()?.walletBalance ?? 0) - commissionDeducted;

    tx.update(rideRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    tx.update(driverRef, { totalRides: FieldValue.increment(1), walletBalance: newBalance });

    const txnRef = driverRef.collection('walletTransactions').doc();
    tx.set(txnRef, {
      type: 'commission',
      amount: -commissionDeducted,
      balanceAfter: newBalance,
      status: 'completed',
      rideId,
      proofImageUrl: null,
      note: `Commission (${(commissionRate * 100).toFixed(0)}%) on ${fare.toLocaleString()} fare`,
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
    });

    // Count the trip into the admin analytics counters in the same
    // transaction so stats stay consistent with the wallet ledger.
    txRecordCompletedRide(tx, fare, commissionDeducted, ride.rideTypeId);
  });

  const rideSnap = await rideRef.get();
  const riderToken = rideSnap.data()?.riderId
    ? await getRiderPushToken(rideSnap.data()!.riderId)
    : undefined;
  if (riderToken) {
    await sendPushToTokens([riderToken], {
      title: 'Trip complete',
      body: 'Rate your driver and leave a review.',
      data: { type: 'trip_completed', rideId },
    });
  }

  return { ok: true, commissionDeducted };
});
