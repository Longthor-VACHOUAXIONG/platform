#!/bin/bash
# Deploys the gofair backend + admin dashboard to the VPS.
#
# Prereqs (done once):
#   - The maps stack already running on the VPS (infra/README.md).
#   - A Firebase service-account JSON on the VPS at /root/gofair/gofair-service-account.json
#     (Firebase Console -> Project settings -> Service accounts -> Generate new private key).
#   - admin-dashboard/src/lib/firebaseConfig.ts has the REAL web apiKey + appId
#     (Firebase Console -> Add app -> Web). Until then the dashboard build is skipped.
#
# Usage (from the repo root):  bash infra/deploy/deploy.sh

set -euo pipefail

VPS="${VPS:-root@178.105.31.74}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/getvgo_deploy}"
REMOTE_DIR=/root/gofair
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=20)
SCP=(scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

# The VPS sshd sometimes throttles bursts of connections (kex timeout). Retry
# each connection a few times with a short backoff instead of failing the whole
# deploy on a transient drop.
run_ssh() { for i in 1 2 3 4 5; do "${SSH[@]}" "$@" && return 0; sleep 3; done; return 1; }
run_scp() { for i in 1 2 3 4 5; do "${SCP[@]}" "$@" && return 0; sleep 3; done; return 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# ---- 0. admin dashboard ----
if grep -q "REPLACE_ME" admin-dashboard/src/lib/firebaseConfig.ts; then
  echo "WARN: admin-dashboard web apiKey/appId are still REPLACE_ME — skipping dashboard deploy."
  echo "      Fill them in (Firebase Console -> Add app -> Web) and re-run."
else
  echo "==> Building admin-dashboard"
  (cd admin-dashboard && npm run build)
fi

# ---- 1. copy source to the VPS ----
echo "==> Syncing backend + deploy files to $VPS:$REMOTE_DIR"
run_ssh "$VPS" "mkdir -p $REMOTE_DIR/infra/deploy $REMOTE_DIR/backend/functions"
# Only what the Docker build needs — node_modules/lib are rebuilt on the VPS.
for f in backend/functions/package.json backend/functions/package-lock.json backend/functions/tsconfig.json backend/functions/Dockerfile backend/functions/.dockerignore; do
  run_scp "$f" "$VPS:$REMOTE_DIR/$f"
done
run_ssh "$VPS" "rm -rf $REMOTE_DIR/backend/functions/src"
run_scp -r backend/functions/src "$VPS:$REMOTE_DIR/backend/functions/src"
run_scp -r infra/deploy/* "$VPS:$REMOTE_DIR/infra/deploy/"
if [ -d admin-dashboard/dist ]; then
  run_ssh "$VPS" "mkdir -p /var/www/gofair"
  run_scp -r admin-dashboard/dist/* "$VPS:/var/www/gofair/"
  echo "==> Copied dashboard build to /var/www/gofair"
fi

# ---- 2. service-account check ----
echo "==> Checking backend credentials"
run_ssh "$VPS" "test -s $REMOTE_DIR/gofair-service-account.json || { echo 'ERROR: missing $REMOTE_DIR/gofair-service-account.json (Firebase service-account key). Backend will not start.'; exit 1; }"

# ---- 3. backend .env ----
run_ssh "$VPS" "if [ ! -f $REMOTE_DIR/infra/deploy/.env ]; then cat > $REMOTE_DIR/infra/deploy/.env <<'EOF'
GCLOUD_PROJECT=lao-taxi
GCRED_JSON_PATH=$REMOTE_DIR/gofair-service-account.json
SENTRY_DSN=https://402093dd9d751b0ec137a617768da57c@o4511885892321280.ingest.us.sentry.io/4511886104002560
EOF
echo '==> Wrote .env (edit GCLOUD_PROJECT if your Firebase project differs)'; fi"

# ---- 4. build + start the backend ----
echo "==> Building + starting the backend container"
# The host may have docker-compose (v1) or the `docker compose` plugin. The
# COMPOSE_CMD variable below must be resolved *remotely* — a local variable is
# never exported to the SSH session, so referencing it there yields an empty
# command. Run whichever binary exists.
run_ssh "$VPS" "cd $REMOTE_DIR/infra/deploy && if command -v docker-compose >/dev/null 2>&1; then docker-compose up -d --build; else docker compose up -d --build; fi"

# ---- 5. caddy ----
echo "==> Installing/updating Caddy"
run_ssh "$VPS" "command -v caddy >/dev/null 2>&1 || { curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null && apt-get update && apt-get install -y caddy; }"
run_scp infra/deploy/Caddyfile "$VPS:/etc/caddy/Caddyfile"
run_ssh "$VPS" "systemctl enable caddy && systemctl restart caddy"

echo ""
echo "==> Done. Verify:"
echo "  https://api.gofair.getvgo.com/healthz"
echo "  https://gofair.getvgo.com"
echo "  https://maps.gofair.getvgo.com/tile/10/818/436.png"
echo "Remember to point DNS A records at the VPS for gofair/api/maps.gofair.getvgo.com."
