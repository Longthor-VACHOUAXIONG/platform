import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';

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
 * Suggests a recommended fare for a pickup/destination pair, the same way
 * the rider app shows a "Recommended fare" before the rider can adjust it.
 * Uses straight-line distance * a per-km rate from pricingConfig; swap in a
 * real routing API (Google Directions/Mapbox) for road-distance accuracy.
 */
export const getRecommendedFare = onCall(async (request) => {
  const { pickup, destination, rideTypeId, zoneId } = request.data as {
    pickup: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    rideTypeId: 'ride' | 'electro' | 'moto' | 'comfort';
    zoneId: string;
  };

  if (!pickup || !destination || !rideTypeId || !zoneId) {
    throw new HttpsError('invalid-argument', 'pickup, destination, rideTypeId, zoneId are required.');
  }

  const configDoc = await db.collection('pricingConfig').doc(zoneId).get();
  if (!configDoc.exists) throw new HttpsError('not-found', `No pricing config for zone ${zoneId}`);
  const config = configDoc.data()!;

  const distanceKm = haversineKm(pickup, destination);
  const rate = config.baseFarePerKm[rideTypeId] ?? config.baseFarePerKm.ride;
  const raw = distanceKm * rate;
  const fare = Math.max(config.minimumFare, Math.round(raw / 500) * 500); // round to nearest 500

  return { fare, currency: config.currency, distanceKm: Number(distanceKm.toFixed(2)) };
});
