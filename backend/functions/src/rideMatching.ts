import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, GeoPoint, type DocumentReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from './firebaseAdmin';
import { geohashEncode } from './geohash';

const SEARCH_RADIUS_KM = 5;

type RideForMatching = {
  pickup: { label: string; geo?: unknown; latitude?: number; longitude?: number };
  destination: { label: string };
  requestedFare?: number;
  currency?: string;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Finds nearby online + approved drivers for a ride, tags the ride doc with
 * the matched IDs + geohash (so the driver app can query near me directly),
 * and pushes a notification to each nearby driver. Shared by the
 * `requestRide` callable (VPS-hosted path) and the `onRideRequestCreated`
 * trigger (legacy/Firebase-deployed path, used only if the doc was created
 * directly by a client).
 */
async function matchDriversAndNotify(
  rideRef: DocumentReference,
  ride: RideForMatching
) {
  const pickup = ride.pickup;
  let pickupLat: number;
  let pickupLng: number;

  if (pickup.geo instanceof GeoPoint) {
    pickupLat = pickup.geo.latitude;
    pickupLng = pickup.geo.longitude;
  } else if (typeof pickup.latitude === 'number' && typeof pickup.longitude === 'number') {
    pickupLat = pickup.latitude;
    pickupLng = pickup.longitude;
  } else {
    logger.warn('Ride request missing pickup geo');
    return;
  }

  const driversSnap = await db
    .collection('drivers')
    .where('isOnline', '==', true)
    .where('verificationStatus', '==', 'approved')
    .get();

  const nearbyDriverIds: string[] = [];
  const pushTokens: string[] = [];
  driversSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.currentLocation) return;
    const distanceKm = haversineKm(
      { lat: pickupLat, lng: pickupLng },
      { lat: d.currentLocation.latitude, lng: d.currentLocation.longitude }
    );
    if (distanceKm <= SEARCH_RADIUS_KM) {
      nearbyDriverIds.push(doc.id);
      if (d.pushToken) pushTokens.push(d.pushToken);
    }
  });

  logger.info(`Matched ${nearbyDriverIds.length} drivers for ride ${rideRef.id}`);

  const geohashPrefix5 = geohashEncode(pickupLat, pickupLng, 5);

  await rideRef.update({ matchedDriverIds: nearbyDriverIds, geohashPrefix5 });

  await sendPushToTokens(pushTokens, {
    title: 'New ride request nearby',
    body: `${ride.pickup.label} → ${ride.destination.label} · ${ride.currency}${ride.requestedFare?.toLocaleString?.() ?? ride.requestedFare}`,
    data: { type: 'new_ride_request', rideId: rideRef.id },
  });
}

/**
 * Rider creates a ride request. Serves the same job the app's old client-side
 * `addDoc` + the onRideRequestCreated trigger did, but as a single callable —
 * the way the backend runs on the VPS (a plain server can't run Firestore
 * triggers, so creation + matching + push happen in this one request).
 */
export const requestRide = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { riderName, pickup, destination, rideTypeId, requestedFare } = request.data as {
    riderName: string;
    pickup: { label: string; lat: number; lng: number };
    destination: { label: string; lat: number; lng: number };
    rideTypeId: string;
    requestedFare: number;
  };

  if (!riderName || !pickup?.label || !destination?.label || !rideTypeId || !requestedFare || requestedFare <= 0) {
    throw new HttpsError('invalid-argument', 'riderName, pickup, destination, rideTypeId, requestedFare are required.');
  }
  if (typeof pickup.lat !== 'number' || typeof pickup.lng !== 'number') {
    throw new HttpsError('invalid-argument', 'pickup coordinates are required.');
  }
  if (typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
    throw new HttpsError('invalid-argument', 'destination coordinates are required.');
  }

  const rideRef = db.collection('rideRequests').doc();
  const ride = {
    pickup: { label: pickup.label, geo: new GeoPoint(pickup.lat, pickup.lng) },
    destination: { label: destination.label, geo: new GeoPoint(destination.lat, destination.lng) },
    requestedFare,
  };

  await rideRef.set({
    riderId: uid,
    riderName,
    pickup: ride.pickup,
    destination: ride.destination,
    rideTypeId,
    requestedFare,
    currency: 'LAK',
    status: 'searching',
    assignedDriverId: null,
    assignedFare: null,
    paymentMethod: 'wallet',
    paymentStatus: 'n/a',
    geohashPrefix5: geohashEncode(pickup.lat, pickup.lng, 5),
    // Marks this as server-created so the onRideRequestCreated trigger (if it
    // ever fires, e.g. an old app build writing directly) skips re-matching
    // and double-pushing.
    createdBy: 'callable',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await matchDriversAndNotify(rideRef, ride);

  return { rideId: rideRef.id };
});

/**
 * When a rider creates a rideRequests doc, find nearby online + approved
 * drivers and (in production) push a notification to each of them so their
 * app surfaces the request. Rides created via the `requestRide` callable are
 * already matched server-side (see `createdBy: 'callable'`), so this skips
 * them to avoid double work.
 */
export const onRideRequestCreated = onDocumentCreated(
  'rideRequests/{rideId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const ride = snap.data();
    if (ride.createdBy === 'callable') return;

    await matchDriversAndNotify(snap.ref, ride as RideForMatching);
  }
);

/**
 * Sends a push notification to a batch of FCM tokens, silently dropping any
 * that are invalid/stale (drivers who uninstalled, etc.) rather than failing
 * the whole batch.
 */
export async function sendPushToTokens(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> }
) {
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    data: message.data ?? {},
    android: { priority: 'high', notification: { channelId: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  });

  if (response.failureCount > 0) {
    const staleTokens = response.responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter((t): t is string => !!t);
    logger.warn(`${response.failureCount} push(es) failed`, { staleTokens });
    // TODO: look up which driver(s) own these stale tokens and clear
    // drivers/{uid}.pushToken so you stop retrying dead tokens.
  }
}
