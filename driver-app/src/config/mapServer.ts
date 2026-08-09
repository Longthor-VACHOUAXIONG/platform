// Points at your self-hosted OSRM and tile server on Hetzner VPS.
// Domains must have A records pointing to 178.105.31.74 and valid SSL certs.
// See /infra/README.md for setup instructions.

export const MAP_CONFIG = {
  // Production domains with HTTPS (required for App Store / Play Store)
  OSRM_SERVER: "https://osrm.getvgo.com",
  TILE_SERVER: "https://maps.getvgo.com",
  
  // Fallback disabled in production - strict domain usage
  USE_FALLBACK: false,
};

// Backwards-compatible exports for existing code
export const OSRM_BASE_URL = MAP_CONFIG.OSRM_SERVER;
export const TILE_URL_TEMPLATE = `${MAP_CONFIG.TILE_SERVER}/tile/{z}/{x}/{y}.png`;
export const NOMINATIM_BASE_URL = "https://osrm.getvgo.com"; // Use same domain for geocoding
