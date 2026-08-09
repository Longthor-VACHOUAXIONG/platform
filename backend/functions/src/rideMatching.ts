import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from './firebaseAdmin';
import { geohashEncode } from './geohash';

const SEARCH_RADIUS_KM = 5;

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
 * When a rider creates a rideRequests doc, find nearby online + approved
 * drivers and (in production) push a notification to each of them so their
 * app surfaces the request. For now this just tags the matched driver IDs
 * onto the ride doc for visibility/debugging — swap the TODO for FCM once
 * you have push notification tokens stored on driver docs.
 */
export const onRideRequestCreated = onDocumentCreated(
  'rideRequests/{rideId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const ride = snap.data();
    const pickup = ride.pickup?.geo;
    if (!pickup) {
      logger.warn('Ride request missing pickup geo', { rideId: event.params.rideId });
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
        { lat: pickup.latitude, lng: pickup.longitude },
        { lat: d.currentLocation.latitude, lng: d.currentLocation.longitude }
      );
      if (distanceKm <= SEARCH_RADIUS_KM) {
        nearbyDriverIds.push(doc.id);
        if (d.pushToken) pushTokens.push(d.pushToken);
      }
    });

    logger.info(`Matched ${nearbyDriverIds.length} drivers for ride ${event.params.rideId}`);

    // Tag the ride with a geohash so the driver app can query "open requests
    // near me" directly against Firestore, instead of pulling every open
    // request city-wide to every driver's device.
    const geohashPrefix5 = geohashEncode(pickup.latitude, pickup.longitude, 5);

    await snap.ref.update({ matchedDriverIds: nearbyDriverIds, geohashPrefix5 });

    await sendPushToTokens(pushTokens, {
      title: 'New ride request nearby',
      body: `${ride.pickup.label} → ${ride.destination.label} · ${ride.currency}${ride.requestedFare?.toLocaleString?.() ?? ride.requestedFare}`,
      data: { type: 'new_ride_request', rideId: event.params.rideId },
    });
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
    android: { priority: 'high' },
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
