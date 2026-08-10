// Where the backend business-logic functions live. In development these ran
// as Firebase Cloud Functions; for the VPS deploy they run on the VPS behind
// Caddy and are served at this domain (see infra/README.md). The Firebase
// callable SDK reaches them via this custom domain instead of
// `https://<region>-<project>.cloudfunctions.net`.
export const FUNCTIONS_DOMAIN = 'https://api.gofair.getvgo.com';
