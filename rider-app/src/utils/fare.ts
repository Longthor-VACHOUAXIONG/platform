export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Offline fallback per-km rates, only used when getRecommendedFare (the
// backend callable that reads the admin's pricingConfig) is unreachable, so
// the screen still shows something sane. The backend re-validates the fare
// against the real config, so this can't drift into wrong prices.
const FALLBACK_RATE_PER_KM: Record<string, number> = {
  ride: 3000,
  electro: 3800,
  moto: 1800,
  comfort: 3500,
  courier: 4000,
};
const FALLBACK_MINIMUM_FARE = 10000;

export function estimateFareForDistance(distanceKm: number, rideTypeId: string): number {
  const rate = FALLBACK_RATE_PER_KM[rideTypeId] ?? FALLBACK_RATE_PER_KM.ride;
  const raw = distanceKm * rate;
  return Math.max(FALLBACK_MINIMUM_FARE, Math.round(raw / 500) * 500);
}

/** @deprecated prefer real road distance from getDrivingRoute() + estimateFareForDistance() */
export function estimateFare(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  rideTypeId: string
): number {
  return estimateFareForDistance(haversineKm(pickup, destination), rideTypeId);
}
