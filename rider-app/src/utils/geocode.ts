import { NOMINATIM_BASE_URL } from '../config/mapServer';

/**
 * Turns coordinates into a short human-readable label, e.g. "Khouvieng Road".
 * Uses your self-hosted Nominatim instance. Falls back to a lat/lng string
 * if the request fails (VPS down, no network, etc) so the flow never blocks.
 */
export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    const addr = data?.address;
    if (!addr) return fallbackLabel(lat, lng);

    const parts = [addr.road, addr.suburb ?? addr.village, addr.city ?? addr.town].filter(Boolean);
    const unique = Array.from(new Set(parts));
    return unique.slice(0, 2).join(', ') || data.display_name || fallbackLabel(lat, lng);
  } catch {
    return fallbackLabel(lat, lng);
  }
}

function fallbackLabel(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
