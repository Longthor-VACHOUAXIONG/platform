const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Standard geohash encoding (interleaved lat/lng binary search into base32). */
export function geohashEncode(lat: number, lng: number, precision = 5): string {
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true; // start with longitude

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng > mid) {
        ch |= 1 << (4 - bit);
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// Roughly how many km a 5-character geohash cell spans (±4.9km x ±4.9km).
// Used to pick the neighbor offset when building the 3x3 search grid below.
const CELL_KM_AT_PRECISION_5 = 4.9;

/**
 * Returns the geohash-5 prefixes for the 3x3 grid of cells centered on
 * (lat, lng) — i.e. the cell containing the point plus its 8 neighbors.
 * A driver (or the matching function) queries all of these prefixes to
 * cover roughly a `radiusKm` circle without needing true geohash
 * bit-neighbor math or Firestore range queries — a small array of exact
 * prefix matches is simpler to reason about and fast enough at pilot scale.
 */
export function nearbyGeohashPrefixes(lat: number, lng: number, radiusKm = 5): string[] {
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180) || 1;
  const step = Math.max(radiusKm, CELL_KM_AT_PRECISION_5);

  const dLat = step / kmPerDegLat;
  const dLng = step / kmPerDegLng;

  const prefixes = new Set<string>();
  for (const latOffset of [-1, 0, 1]) {
    for (const lngOffset of [-1, 0, 1]) {
      const pointLat = Math.max(-90, Math.min(90, lat + latOffset * dLat));
      const pointLng = ((lng + lngOffset * dLng + 540) % 360) - 180; // wrap ±180
      prefixes.add(geohashEncode(pointLat, pointLng, 5));
    }
  }
  return Array.from(prefixes);
}
