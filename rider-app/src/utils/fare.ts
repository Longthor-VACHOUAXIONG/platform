export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Placeholder per-km rates so the app shows a sensible fare instantly,
// without waiting on a network round-trip to the backend. These should
// match whatever you configure in `pricingConfig` on the backend — the
// backend's getRecommendedFare Cloud Function is the source of truth for
// anything money actually changes hands on; this is just for instant UI.
const RATE_PER_KM: Record<string, number> = {
  ride: 3000,
  electro: 3800,
  moto: 1800,
  comfort: 3500,
};
const MINIMUM_FARE = 10000;

export function estimateFareForDistance(distanceKm: number, rideTypeId: string): number {
  const rate = RATE_PER_KM[rideTypeId] ?? RATE_PER_KM.ride;
  const raw = distanceKm * rate;
  return Math.max(MINIMUM_FARE, Math.round(raw / 500) * 500);
}

/** @deprecated prefer real road distance from getDrivingRoute() + estimateFareForDistance() */
export function estimateFare(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  rideTypeId: string
): number {
  return estimateFareForDistance(haversineKm(pickup, destination), rideTypeId);
}
