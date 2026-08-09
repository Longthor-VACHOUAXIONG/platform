// Points at your own VPS running the Docker stack in /infra — see
// /infra/README.md for setup. Swap these to a domain (with HTTPS) once you
// move past testing — see /infra/README.md "Production hardening".
const HOST = '178.105.31.74';

export const TILE_URL_TEMPLATE = `http://${HOST}/tile/{z}/{x}/{y}.png`;
export const OSRM_BASE_URL = `http://${HOST}:5000`;
export const NOMINATIM_BASE_URL = `http://${HOST}:8080`;
