import { OSRM_BASE_URL } from '../config/mapServer';
import { estimateFareForDistance } from './fare';

export type LatLng = { latitude: number; longitude: number };

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  polyline: LatLng[];
};

/**
 * Fetches the driving route between two points from your self-hosted OSRM
 * instance — real road distance/duration and a route geometry to draw on
 * the map, same job the Google Directions API was doing. Falls back to
 * `null` on any failure so callers can fall back to a straight-line
 * estimate rather than crash the flow (e.g. if the VPS is temporarily down).
 */
export async function getDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  try {
    const url =
      `${OSRM_BASE_URL}/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      console.warn('OSRM returned no route:', data.code, data.message);
      return null;
    }

    const route = data.routes[0];
    const coords: [number, number][] = route.geometry.coordinates;

    return {
      distanceKm: route.distance / 1000,
      durationMin: Math.round(route.duration / 60),
      polyline: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    };
  } catch (err) {
    console.warn('OSRM request failed:', err);
    return null;
  }
}

/**
 * Calculates accurate fare using real road distance from OSRM.
 * Falls back to straight-line estimate with a 1.3x multiplier to avoid undercharging
 * if OSRM is unavailable.
 */
export async function calculateAccurateFare(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  rideTypeId: string
): Promise<number> {
  const route = await getDrivingRoute(pickup, destination);
  
  if (route && route.distanceKm > 0) {
    // Use actual road distance
    return estimateFareForDistance(route.distanceKm, rideTypeId);
  }
  
  // Fallback: straight-line distance with 1.3x multiplier to compensate for roads
  const { haversineKm } = await import('./fare');
  const straightLineDistance = haversineKm(pickup, destination);
  const estimatedRoadDistance = straightLineDistance * 1.3;
  return estimateFareForDistance(estimatedRoadDistance, rideTypeId);
}
