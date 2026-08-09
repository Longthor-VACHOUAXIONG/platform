/**
 * Run this ONCE with the Firebase Admin SDK (locally, with a service account
 * key — never ship this into the app) to make your first admin user.
 *
 * Usage:
 *   1. Download a service account key from Firebase Console →
 *      Project Settings → Service Accounts → Generate new private key.
 *   2. Save it as serviceAccountKey.json in this folder (already gitignored).
 *   3. npx ts-node bootstrap-admin.ts <uid-of-first-admin>
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: ts-node bootstrap-admin.ts <uid>');
  process.exit(1);
}

getAuth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`✅ ${uid} is now an admin. They must sign out/in for the claim to take effect.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
