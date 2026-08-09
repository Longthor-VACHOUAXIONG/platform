// Points at your own VPS running the Docker stack in /infra — see
// /infra/README.md for setup.
// 
// ⚠️ PRODUCTION: Replace IP with a domain name and enable HTTPS (see /infra/README.md "Production hardening").
// App stores require HTTPS for network requests. Example:
//   const HOST = 'maps.gofair.la'; // with HTTPS cert from Let's Encrypt
//   export const TILE_URL_TEMPLATE = `https://${HOST}/tile/{z}/{x}/{y}.png`;
const HOST = '178.105.31.74';

export const TILE_URL_TEMPLATE = `http://${HOST}/tile/{z}/{x}/{y}.png`;
export const OSRM_BASE_URL = `http://${HOST}:5000`;
export const NOMINATIM_BASE_URL = `http://${HOST}:8080`;
