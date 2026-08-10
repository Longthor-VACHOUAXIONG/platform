/**
 * Load-tests the deployed VPS backend callable functions with real Firebase
 * ID tokens and real concurrent HTTPS traffic.
 *
 * Usage (from backend/functions — needs the service account + firebase-admin):
 *   npx ts-node ../scripts/load-test.ts [function] [concurrency] [durationSeconds]
 *   npx ts-node ../scripts/load-test.ts getRecommendedFare 50 30
 *
 * Targets:
 *   - getRecommendedFare  (read-only; also exercises the OSRM road-distance call)
 *   - healthz             (no auth; pure connectivity)
 *
 * NOTE: `requestRide` can be load-tested too but each call creates a real
 * ride request and pushes to nearby drivers — only do that with a throwaway
 * Firestore test project, not production.
 *
 * Prereqs:
 *   1. Save the service account as backend/scripts/serviceAccountKey.json
 *      (already gitignored).
 *   2. The web API key for ID-token minting (env WEB_API_KEY, or default to
 *      the lao-taxi web app key in this repo's webapikey.txt).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });

const API_BASE = process.env.API_BASE ?? 'https://api.gofair.getvgo.com';
const WEB_API_KEY = process.env.WEB_API_KEY ?? 'AIzaSyBLuQPhn6g-DUMeKWuai2HysLRCCb5OzX0';

const fn = process.argv[2] ?? 'getRecommendedFare';
const concurrency = Math.max(1, Number(process.argv[3] ?? 20));
const durationSec = Math.max(1, Number(process.argv[4] ?? 15));

function payloadFor(name: string): unknown {
  switch (name) {
    case 'getRecommendedFare':
      // Vientiane → a couple km up the road; rides hit OSRM each call.
      return {
        data: {
          pickup: { lat: 17.975, lng: 102.633 },
          destination: { lat: 17.995, lng: 102.665 },
          rideTypeId: 'ride',
          zoneId: 'Vientiane',
        },
      };
    case 'submitOffer':
    case 'acceptOffer':
    case 'cancelRide':
    case 'startTrip':
    case 'completeTrip':
      throw new Error(`Refusing to load-test ${name} — it mutates production state.`);
    default:
      return { data: {} };
  }
}

function httpCall(url: string, method: string, token: string | null, body: unknown): Promise<{ status: number; ms: number }> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const start = Date.now();
    const proto = u.protocol === 'http:' ? require('http') : require('https');
    const req = proto.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res: { statusCode: number }) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - start }));
      }
    );
    req.on('error', () => resolve({ status: 0, ms: Date.now() - start }));
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const uid = 'loadtest-' + Date.now();
  const customToken = await getAuth().createCustomToken(uid);

  const tokenRes = await httpCall(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    'POST',
    null,
    { token: customToken, returnSecureToken: true }
  );
  if (tokenRes.status !== 200) throw new Error('Failed to mint ID token');
  const idToken = await new Promise<string>((resolve, reject) => {
    const https = require('https');
    const u = new URL(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data).idToken); } catch { reject(new Error('token parse failed')); }
      });
    });
    req.write(JSON.stringify({ token: customToken, returnSecureToken: true }));
    req.end();
  });

  const url = fn === 'healthz' ? `${API_BASE}/healthz` : `${API_BASE}/${fn}`;
  const method = fn === 'healthz' ? 'GET' : 'POST';
  const body = fn === 'healthz' ? {} : payloadFor(fn);
  const authHeader = fn === 'healthz' ? null : idToken;

  console.log(`Load-testing ${fn} @ ${url}`);
  console.log(`  concurrency=${concurrency} duration=${durationSec}s`);
  console.log('');

  const latencies: number[] = [];
  let success = 0;
  let failure = 0;
  const failures: string[] = [];
  const startTime = Date.now();

  const worker = async () => {
    while (Date.now() - startTime < durationSec * 1000) {
      const { status, ms } = await httpCall(url, method, authHeader, body);
      latencies.push(ms);
      if (status === 200) success++;
      else {
        failure++;
        if (failures.length < 5) failures.push(`status ${status} (${ms}ms)`);
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const total = success + failure;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);

  console.log(`Results (${total} requests):`);
  console.log(`  success=${success} (${total ? ((success / total) * 100).toFixed(1) : 0}%)  failure=${failure}`);
  console.log(`  avg=${avg.toFixed(0)}ms  p50=${p(0.5).toFixed(0)}ms  p95=${p(0.95).toFixed(0)}ms  max=${(sorted[sorted.length - 1] ?? 0).toFixed(0)}ms`);
  if (failures.length) console.log(`  sample failures: ${failures.join(', ')}`);
  console.log(`  req/s = ${(total / durationSec).toFixed(1)}`);

  await getAuth().deleteUser(uid).catch(() => undefined);
  process.exit(failure > 0 && success === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
