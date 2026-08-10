# Self-hosted map stack

Replaces Google Maps tiles, Directions API, and Geocoding API with three
open-source services you run yourself: a raster tile server, OSRM (routing),
and Nominatim (geocoding). Only ongoing cost is the VPS itself.

## 1. Copy these two files to your VPS

From your own machine:
```bash
scp docker-compose.yml setup.sh root@178.105.31.74:/root/gofair-maps/
```
(create the `gofair-maps` folder first if `scp` complains it doesn't exist:
`ssh root@178.105.31.74 mkdir -p /root/gofair-maps`)

## 2. Run the setup script on the VPS

```bash
ssh root@178.105.31.74
cd /root/gofair-maps
bash setup.sh
```

This installs Docker if needed, downloads the Laos OSM extract (~small),
preprocesses the OSRM routing graph, opens the firewall ports, and starts
all three services. The tile server's first render pass and Nominatim's
first import both take a while — check progress with:
```bash
docker logs -f gofair-tileserver
docker logs -f gofair-nominatim
```

## 3. Verify it's working

```bash
curl -I http://178.105.31.74/tile/10/818/436.png                # tiles
curl 'http://178.105.31.74:5000/route/v1/driving/102.6331,17.9757;102.6382,17.9855?overview=false'  # routing
curl 'http://178.105.31.74:8080/reverse?lat=17.9757&lon=102.6331&format=json'  # geocoding
```

## 4. Point the apps at it

Already done in this codebase — `rider-app/src/config/mapServer.ts` and
`driver-app/src/config/mapServer.ts` point at `https://maps.gofair.getvgo.com`.
That hostname is fronted by the Caddy in `deploy/` (see below), which
path-routes `/tile/*` → tile server (host port 80), `/route/*` → OSRM (5000),
and everything else → Nominatim (8080). All over TLS, so the mobile apps
don't trip iOS ATS / Android cleartext-traffic restrictions.

## Coverage: Laos only, by default

The setup script downloads only the `laos-latest.osm.pbf` extract to keep
resource use reasonable on a single VPS. If you need coverage into
neighboring border areas (Thailand, China, Vietnam), download a larger
Geofabrik extract instead (e.g. all of Southeast Asia) — same process, just
a bigger file and longer preprocessing time. Edit the `PBF_URL` in the
setup script and `docker-compose.yml` accordingly.

## Hosting the backend + admin dashboard on the same VPS

The app stack lives in `deploy/` and runs next to the maps stack:

- **`deploy/docker-compose.yml`** — the backend (Cloud-Functions business
  logic, served by `backend/functions/src/server.ts`) as a container bound to
  `127.0.0.1:8081`. It needs a Firebase service-account JSON mounted in
  (Firebase Console → Project settings → Service accounts → Generate new
  private key) at `/root/gofair/gofair-service-account.json` on the VPS — the
  compose `.env` sets `GCLOUD_PROJECT` and `GCRED_JSON_PATH`.
- **`deploy/Caddyfile`** — host-level Caddy (apt install, replaces the old
  nginx) terminating TLS for:
  - `api.gofair.getvgo.com` → the backend container
  - `gofair.getvgo.com` → the admin dashboard (static Vite build at
    `/var/www/gofair`, SPA fallback)
  - `maps.gofair.getvgo.com` → the maps stack by path: `/tile/*` is rewritten
    to `/styles/osm-bright/*` (the apps request `/tile/{z}/{x}/{y}.png` but
    tileserver-gl serves `/styles/{style}/{z}/{x}/{y}.png`), `/route/*` goes
    to OSRM, and everything else (e.g. `/reverse`, `/search`) goes to
    Nominatim. Also keeps the legacy `maps.getvgo.com` / `osrm.getvgo.com`
    hosts working, including the OSRM `X-OSRM-Token` check.
- **`deploy/deploy.sh`** — one-command deploy: builds the dashboard, copies
  the backend source + Caddyfile to the VPS, builds/starts the container, and
  reloads Caddy.

### As deployed on the VPS (2026-08)

- Caddy v2.11 owns :80/:443 (nginx stopped/disabled). Let's Encrypt certs are
  already live for `gofair`, `maps`, and `osrm.getvgo.com`.
- Maps containers: `osrm-routed` on `127.0.0.1:5000`, `tileserver` on
  `127.0.0.1:8080` (volume `/opt/tiles`, styles osm-bright/basic-preview/
  satellite/standard), and `gofair-nominatim` (mediagis/nominatim:4.5, laos
  import) on `127.0.0.1:8082`.
- Backend image `deploy_gofair-backend` is built; the container is started by
  `deploy/deploy.sh` once the service-account JSON exists.
- DNS records that must exist (add in Cloudflare, **DNS-only / grey cloud** so
  clients reach Caddy directly — `gofair.getvgo.com` is currently proxied in
  Flexible mode which causes an infinite HTTPS redirect loop):
  - `gofair.getvgo.com` → `178.105.31.74`
  - `api.gofair.getvgo.com` → `178.105.31.74`
  - `maps.gofair.getvgo.com` → `178.105.31.74`

Why the functions run as `onCall` handlers on a plain server (not Google
Cloud Functions) instead of deployed: firebase-functions v2 `onCall`/`onRequest`
handlers are Express `(req, res)` handlers that verify the caller's Firebase
ID token themselves — so `server.ts` just mounts each at `/<name>` and the
mobile/web SDKs' callable protocol works unchanged. The two Firestore
*triggers* can't run outside GCF, so that logic moved into two new callables:
`requestRide` (create + match + push in one call, replacing
`onRideRequestCreated`) and `sendChatMessage` (write + push, replacing
`onChatMessageCreated`). The trigger code is kept, marked with a `createdBy:
'callable'` guard, so `firebase deploy` still works as a fallback.

Before the dashboard is usable, fill the real web `apiKey`/`appId` into
`admin-dashboard/src/lib/firebaseConfig.ts` (Firebase Console → Add app → Web).

DNS: point A records for `gofair`, `api.gofair`, and `maps.gofair` at the VPS
IP before Caddy can issue certs.

## Production hardening (before real users depend on this)

This setup is intentionally the minimum to get it working, matching "just
get this running" — a few things worth doing before it's serving real
traffic:

- **Put it behind a domain + HTTPS**, not a bare IP. Mobile OSes increasingly
  restrict plain-HTTP network calls from apps (Android's cleartext traffic
  policy, iOS App Transport Security) — you'll likely need to explicitly
  allow HTTP-to-this-IP in each app's config to test now, but should move to
  `https://maps.yourdomain.com` behind something like Caddy or nginx +
  Let's Encrypt before shipping to real users.
- **Firewall**: right now ports 80/5000/8080 are open to the world. Fine for
  testing; consider putting a reverse proxy in front and only exposing 443.
- **Change `NOMINATIM_PASSWORD`** in `docker-compose.yml` from the placeholder.
- **Back up the `data/` volumes** — re-running the import from scratch after
  data loss takes a while.
- **Monitor disk space** — OSM data + Postgres for Nominatim can grow.
