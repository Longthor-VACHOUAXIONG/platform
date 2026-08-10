import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';

// Self-hosted OSRM endpoint (see infra/README.md). From inside the backend
// container it's reachable via the public HTTPS domain through Caddy; override
// with a direct host (e.g. http://host.docker.internal:5000) if you prefer.
const OSRM_BASE_URL = process.env.OSRM_BASE_URL ?? 'https://maps.gofair.getvgo.com';
const OSRM_TIMEOUT_MS = 3000;

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
 * Road distance between two points from the self-hosted OSRM, in km. Returns
 * null if the routing service is unreachable/slow so callers can fall back to
 * straight-line distance rather than failing the whole fare request.
 */
async function roadDistanceKm(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const url = `${OSRM_BASE_URL}/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=false&alternatives=false`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: { distance?: number }[] };
    const distance = data.routes?.[0]?.distance;
    return typeof distance === 'number' && distance > 0 ? distance / 1000 : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Suggests a recommended fare for a pickup/destination pair, the same way
 * the rider app shows a "Recommended fare" before the rider can adjust it.
 * Uses road distance from the self-hosted OSRM * a per-km rate from
 * pricingConfig; falls back to straight-line (haversine) if OSRM is down.
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

  const distanceKm = (await roadDistanceKm(pickup, destination)) ?? haversineKm(pickup, destination);
  const rate = config.baseFarePerKm[rideTypeId] ?? config.baseFarePerKm.ride;
  const raw = distanceKm * rate;
  const fare = Math.max(config.minimumFare, Math.round(raw / 500) * 500); // round to nearest 500

  return { fare, currency: config.currency, distanceKm: Number(distanceKm.toFixed(2)) };
});
