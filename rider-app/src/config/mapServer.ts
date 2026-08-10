// Points at the self-hosted map stack on the gofair VPS (see /infra/README.md).
// Served over HTTPS behind Caddy at this domain so the mobile apps don't trip
// iOS ATS / Android cleartext-traffic restrictions.
const HOST = 'maps.gofair.getvgo.com';

export const TILE_URL_TEMPLATE = `https://${HOST}/tile/{z}/{x}/{y}.png`;
export const OSRM_BASE_URL = `https://${HOST}`;
export const NOMINATIM_BASE_URL = `https://${HOST}`;
