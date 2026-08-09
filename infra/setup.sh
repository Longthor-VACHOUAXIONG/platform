#!/bin/bash
set -euo pipefail

# Run this once on the VPS, in the same directory as docker-compose.yml.
# Usage: bash setup.sh

echo "==> Installing Docker (skip if already installed)"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  apt-get update && apt-get install -y docker-compose-plugin
fi

echo "==> Downloading Laos OSM extract (~small, well under 100MB)"
mkdir -p data
if [ ! -f data/laos-latest.osm.pbf ]; then
  curl -fL -o data/laos-latest.osm.pbf https://download.geofabrik.de/asia/laos-latest.osm.pbf
fi

echo "==> Preprocessing the OSRM routing graph (extract -> partition -> customize)"
docker run --rm -v "$(pwd)/data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/laos-latest.osm.pbf
docker run --rm -v "$(pwd)/data:/data" osrm/osrm-backend osrm-partition /data/laos-latest.osrm
docker run --rm -v "$(pwd)/data:/data" osrm/osrm-backend osrm-customize /data/laos-latest.osrm

echo "==> Opening firewall ports (80 tiles, 5000 OSRM, 8080 Nominatim)"
if command -v ufw &> /dev/null; then
  ufw allow 80/tcp
  ufw allow 5000/tcp
  ufw allow 8080/tcp
fi

echo "==> Starting the stack"
docker compose up -d

echo ""
echo "Done. First tile-server import can take a while (renders the whole"
echo "region's base layer) — check progress with: docker logs -f gofair-tileserver"
echo "Nominatim's first import also takes time — check with: docker logs -f gofair-nominatim"
echo ""
echo "Test once running:"
echo "  Tiles:      curl -I http://localhost/tile/10/818/436.png"
echo "  Routing:    curl 'http://localhost:5000/route/v1/driving/102.6331,17.9757;102.6382,17.9855?overview=false'"
echo "  Geocoding:  curl 'http://localhost:8080/reverse?lat=17.9757&lon=102.6331&format=json'"
