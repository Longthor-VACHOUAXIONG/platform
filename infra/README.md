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
`driver-app/src/config/mapServer.ts` point at `178.105.31.74` on ports
80/5000/8080. If you move the stack to a different host/domain later
(recommended before a real launch — see "Production hardening" below),
update those two files.

## Coverage: Laos only, by default

The setup script downloads only the `laos-latest.osm.pbf` extract to keep
resource use reasonable on a single VPS. If you need coverage into
neighboring border areas (Thailand, China, Vietnam), download a larger
Geofabrik extract instead (e.g. all of Southeast Asia) — same process, just
a bigger file and longer preprocessing time. Edit the `PBF_URL` in the
setup script and `docker-compose.yml` accordingly.

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
