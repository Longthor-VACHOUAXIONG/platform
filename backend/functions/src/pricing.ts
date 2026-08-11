import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';

// Self-hosted OSRM endpoint (see infra/README.md). From inside the backend
// container it's reachable via the public HTTPS domain through Caddy; override
// with a direct host (e.g. http://host.docker.internal:5000) if you prefer.
const OSRM_BASE_URL = process.env.OSRM_BASE_URL ?? 'https://maps.gofair.getvgo.com';
const OSRM_TIMEOUT_MS = 3000;

// The zone the rider app uses when it doesn't send one (there's no zone
// picker yet). Keep in sync with what the admin creates in the dashboard.
const DEFAULT_ZONE_ID = 'Vientiane';

// Safe fallbacks when a pricingConfig doc is missing or only partially filled
// in — a malformed admin edit must never make the pricing callable crash.
const DEFAULT_MINIMUM_FARE = 10000;
const DEFAULT_CURRENCY = 'LAK';
const DEFAULT_BASE_FARE_PER_KM: Record<string, number> = {
  ride: 3000,
  electro: 3800,
  moto: 1800,
  comfort: 3500,
  courier: 4000,
};

export const ALLOWED_RIDE_TYPES = Object.keys(DEFAULT_BASE_FARE_PER_KM);

export type ZoneConfig = {
  zoneName: string;
  baseFarePerKm: Record<string, number>;
  minimumFare: number;
  currency: string;
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
 * Loads a zone's pricing config, filling any missing fields from the safe
 * defaults so callers never have to guard against a half-filled admin edit.
 */
export async function getZoneConfig(zoneId: string): Promise<ZoneConfig> {
  const doc = await db.collection('pricingConfig').doc(zoneId).get();
  const data = doc.data();
  return {
    zoneName: data?.zoneName ?? zoneId,
    baseFarePerKm: { ...DEFAULT_BASE_FARE_PER_KM, ...(data?.baseFarePerKm ?? {}) },
    minimumFare:
      typeof data?.minimumFare === 'number' && data.minimumFare > 0
        ? data.minimumFare
        : DEFAULT_MINIMUM_FARE,
    currency: typeof data?.currency === 'string' ? data.currency : DEFAULT_CURRENCY,
  };
}

export type RecommendedFareResult = {
  fare: number;
  currency: string;
  distanceKm: number;
  minimumFare: number;
  zoneId: string;
};

/**
 * The single place that turns a pickup/destination/rideType into a money
 * number: road distance (OSRM) × the admin-configured per-km rate for that
 * ride type, floored at the configured minimum and rounded to 500 kip. Falls
 * back to straight-line (haversine) distance if OSRM is down.
 *
 * `requestRide` validates against this same helper, so the number the app
 * displays and the number the backend accepts can never disagree.
 */
export async function computeRecommendedFare(params: {
  pickup: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  rideTypeId: string;
  zoneId?: string;
}): Promise<RecommendedFareResult> {
  const zoneId = params.zoneId ?? DEFAULT_ZONE_ID;
  const config = await getZoneConfig(zoneId);
  const distanceKm =
    (await roadDistanceKm(params.pickup, params.destination)) ?? haversineKm(params.pickup, params.destination);
  const rate = config.baseFarePerKm[params.rideTypeId] ?? config.baseFarePerKm.ride;
  const raw = distanceKm * rate;
  const fare = Math.max(config.minimumFare, Math.round(raw / 500) * 500); // round to nearest 500

  return {
    fare,
    currency: config.currency,
    distanceKm: Number(distanceKm.toFixed(2)),
    minimumFare: config.minimumFare,
    zoneId,
  };
}

/**
 * Suggests a recommended fare for a pickup/destination pair — the number the
 * rider app shows as "Recommended fare" before the rider can adjust it.
 */
export const getRecommendedFare = onCall(async (request) => {
  const { pickup, destination, rideTypeId, zoneId } = request.data as {
    pickup: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    rideTypeId: string;
    zoneId?: string;
  };

  if (!pickup || !destination || !rideTypeId) {
    throw new HttpsError('invalid-argument', 'pickup, destination and rideTypeId are required.');
  }
  if (!ALLOWED_RIDE_TYPES.includes(rideTypeId)) {
    throw new HttpsError('invalid-argument', 'Unknown rideTypeId.');
  }

  const result = await computeRecommendedFare({ pickup, destination, rideTypeId, zoneId });
  return {
    fare: result.fare,
    currency: result.currency,
    distanceKm: result.distanceKm,
    minimumFare: result.minimumFare,
  };
});
