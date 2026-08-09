import { OSRM_BASE_URL } from '../config/mapServer';
import { estimateFareForDistance } from './fare';

export type LatLng = { latitude: number; longitude: number };

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  polyline: LatLng[];
  geometry?: any; // GeoJSON geometry for advanced rendering
};

/**
 * Fetches the driving route between two points from your self-hosted OSRM
 * instance at https://osrm.getvgo.com — real road distance/duration and a 
 * route geometry to draw on the map.
 * 
 * Uses HTTPS for App Store compliance. Falls back to `null` on any failure 
 * so callers can fall back to a straight-line estimate rather than crash 
 * the flow (e.g. if the VPS is temporarily down).
 */
export async function getDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult | null> {
  try {
    // OSRM expects coordinates in lng,lat order
    const url =
      `${OSRM_BASE_URL}/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson&alternatives=false`;

    const res = await fetch(url, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // 5 second timeout to prevent hanging
      signal: AbortSignal.timeout(5000)
    });
    
    if (!res.ok) {
      console.warn(`OSRM HTTP error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      console.warn('OSRM returned no route:', data.code, data.message);
      return null;
    }

    const route = data.routes[0];
    const coords: [number, number][] = route.geometry.coordinates;

    return {
      distanceKm: route.distance / 1000, // meters to km
      durationMin: Math.round(route.duration / 60), // seconds to minutes
      polyline: coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      geometry: route.geometry, // Keep GeoJSON for advanced use cases
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('OSRM request timed out after 5s');
    } else {
      console.warn('OSRM request failed:', err.message ?? err);
    }
    return null;
  }
}

/**
 * Calculates accurate fare using real road distance from OSRM.
 * Falls back to straight-line estimate with a 1.3x multiplier to avoid undercharging
 * if OSRM is unavailable (VPS down, network issue, etc.).
 * 
 * @returns Fare in LAK (Lao Kip)
 */
export async function calculateAccurateFare(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  rideTypeId: string
): Promise<number> {
  const route = await getDrivingRoute(pickup, destination);
  
  if (route && route.distanceKm > 0) {
    // Use actual road distance - most accurate
    return estimateFareForDistance(route.distanceKm, rideTypeId);
  }
  
  // Fallback: straight-line distance with 1.3x multiplier to compensate for roads
  // This prevents undercharging when OSRM is unavailable
  const { haversineKm } = await import('./fare');
  const straightLineDistance = haversineKm(pickup, destination);
  const estimatedRoadDistance = straightLineDistance * 1.3;
  return estimateFareForDistance(estimatedRoadDistance, rideTypeId);
}

/**
 * Validates that OSRM server is reachable and responding.
 * Call this during app startup or before showing fare estimates.
 */
export async function validateOSRMConnection(): Promise<boolean> {
  try {
    const testRoute = await getDrivingRoute(
      { lat: 17.9757, lng: 102.6331 }, // Vientiane center
      { lat: 17.9800, lng: 102.6400 }  // Nearby point
    );
    return testRoute !== null;
  } catch {
    return false;
  }
}
