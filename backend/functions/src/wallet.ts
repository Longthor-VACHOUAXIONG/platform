import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { createHmac, timingSafeEqual } from 'crypto';
import { FieldValue, GeoPoint } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { txRecordTopUpApproved } from './analytics';

const DEFAULT_MINIMUM_BALANCE = 50000;
const DEFAULT_MIN_TOPUP_AMOUNT = 50000;
const DEFAULT_MAX_TOPUP_AMOUNT = 5_000_000;

/**
 * Driver toggles online/offline. Going online is gated on wallet balance —
 * this check happens server-side (not just in the app UI) so a modified
 * client can't bypass it. Going offline is always allowed.
 */
export const setOnlineStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { isOnline, lat, lng } = request.data as { isOnline: boolean; lat?: number; lng?: number };

  if (isOnline) {
    const [driverDoc, configDoc] = await Promise.all([
      db.collection('drivers').doc(uid).get(),
      db.collection('walletConfig').doc('default').get(),
    ]);
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver profile not found.');

    const balance = driverDoc.data()!.walletBalance ?? 0;
    const minimumBalance = configDoc.data()?.minimumBalance ?? DEFAULT_MINIMUM_BALANCE;

    if (balance < minimumBalance) {
      // Structured details so the client can show "top up X more" without
      // parsing a message string.
      throw new HttpsError('failed-precondition', 'INSUFFICIENT_BALANCE', {
        balance,
        minimumBalance,
        shortfall: minimumBalance - balance,
      });
    }
  }

  await db.collection('drivers').doc(uid).update({
    isOnline,
    ...(isOnline && lat != null && lng != null
      ? { currentLocation: new GeoPoint(lat, lng), lastLocationAt: FieldValue.serverTimestamp() }
      : {}),
  });

  return { ok: true };
});

/** Reads top-up amount bounds from walletConfig so they're tunable in the
 * admin dashboard rather than buried in code. */
async function topUpAmountBounds() {
  const configDoc = await db.collection('walletConfig').doc('default').get();
  const config = configDoc.data();
  return {
    min: config?.minTopUpAmount ?? DEFAULT_MIN_TOPUP_AMOUNT,
    max: config?.maxTopUpAmount ?? DEFAULT_MAX_TOPUP_AMOUNT,
  };
}

function assertTopUpAmount(amount: number, min: number, max: number) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'A positive amount is required.');
  }
  if (amount < min || amount > max) {
    throw new HttpsError(
      'invalid-argument',
      `Top-up amount must be between ${min} and ${max}.`,
      { min, max }
    );
  }
}

/** Driver submits a top-up request after manually transferring via bank QR. */
export const requestTopUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { amount, proofImageUrl } = request.data as { amount: number; proofImageUrl?: string };
  const { min, max } = await topUpAmountBounds();
  assertTopUpAmount(amount, min, max);

  const ref = await db.collection('drivers').doc(uid).collection('walletTransactions').add({
    type: 'topup',
    amount,
    balanceAfter: null,
    status: 'pending',
    rideId: null,
    proofImageUrl: proofImageUrl ?? null,
    note: null,
    createdAt: FieldValue.serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  });

  return { ok: true, transactionId: ref.id };
});

/** Admin approves or rejects a pending top-up. Only credits the wallet on approval. */
export const reviewTopUp = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!request.auth?.token.admin) {
    throw new HttpsError('permission-denied', 'Only an admin can review top-ups.');
  }

  const { driverId, transactionId, approve } = request.data as {
    driverId: string;
    transactionId: string;
    approve: boolean;
  };
  if (!driverId || !transactionId) {
    throw new HttpsError('invalid-argument', 'driverId and transactionId are required.');
  }

  const driverRef = db.collection('drivers').doc(driverId);
  const txnRef = driverRef.collection('walletTransactions').doc(transactionId);

  await db.runTransaction(async (tx) => {
    const [driverDoc, txnDoc] = await Promise.all([tx.get(driverRef), tx.get(txnRef)]);
    if (!txnDoc.exists) throw new HttpsError('not-found', 'Top-up request not found.');
    const txn = txnDoc.data()!;
    if (txn.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request was already reviewed.');
    }

    if (approve) {
      const newBalance = (driverDoc.data()?.walletBalance ?? 0) + txn.amount;
      tx.update(driverRef, { walletBalance: newBalance });
      tx.update(txnRef, {
        status: 'approved',
        balanceAfter: newBalance,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: callerUid,
      });
      // Count the approval into admin analytics in the same transaction.
      txRecordTopUpApproved(tx, txn.amount);
    } else {
      tx.update(txnRef, {
        status: 'rejected',
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: callerUid,
      });
    }
  });

  return { ok: true };
});

/**
 * Shared balance-crediting logic, used by both the manual approval flow
 * above and the BCEL auto-topup webhook below, so there's exactly one place
 * that mutates a wallet balance for a "money arrived" event.
 *
 * Pass `txnDocId` (the bank's reference) to make the credit idempotent: if a
 * transaction with that id already exists the call is a no-op, so a replayed
 * webhook can never double-credit a wallet.
 */
async function creditDriverWallet(driverId: string, amount: number, note: string, txnDocId?: string) {
  const driverRef = db.collection('drivers').doc(driverId);
  const txnRef = txnDocId
    ? driverRef.collection('walletTransactions').doc(txnDocId)
    : driverRef.collection('walletTransactions').doc();

  await db.runTransaction(async (tx) => {
    const driverDoc = await tx.get(driverRef);
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver not found.');

    const existing = await tx.get(txnRef);
    if (existing.exists) return; // already credited (e.g. a webhook replay)

    const newBalance = (driverDoc.data()?.walletBalance ?? 0) + amount;
    tx.update(driverRef, { walletBalance: newBalance });
    tx.set(txnRef, {
      type: 'topup',
      amount,
      balanceAfter: newBalance,
      status: 'approved',
      rideId: null,
      proofImageUrl: null,
      note,
      createdAt: FieldValue.serverTimestamp(),
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: 'bcel-auto',
    });
    txRecordTopUpApproved(tx, amount);
  });
}

/**
 * Driver-facing: kicks off a BCEL auto top-up. Reads credentials from
 * `secureConfig/bcel` (admin-only doc — see firestore.rules) so activating
 * this is purely an admin-dashboard action, no code changes.
 *
 * ⚠️ THE ACTUAL BCEL API CALL IS NOT IMPLEMENTED — I don't have BCEL's API
 * documentation (endpoint, auth scheme, request/response shape), so this is
 * a wired-up scaffold, not a working payment integration. Once you have
 * their API docs, everything you need is already in place:
 *   - credentials are already flowing in from Firestore (`config` below)
 *   - the driver app already calls this function and handles success/error
 *   - `creditDriverWallet()` above is ready to be called from the webhook
 *     once BCEL confirms payment (see `bcelWebhook` below)
 * Replace the TODO block with the real `fetch()` call to BCEL's payment
 * initiation endpoint, per their docs.
 */
export const initiateBcelTopUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { amount } = request.data as { amount: number };
  const { min, max } = await topUpAmountBounds();
  assertTopUpAmount(amount, min, max);

  const [walletConfigDoc, credsDoc] = await Promise.all([
    db.collection('walletConfig').doc('default').get(),
    db.collection('secureConfig').doc('bcel').get(),
  ]);

  if (walletConfigDoc.data()?.topUpMode !== 'auto') {
    throw new HttpsError('failed-precondition', 'AUTO_TOPUP_DISABLED');
  }
  const creds = credsDoc.data();
  if (!creds?.merchantId || !creds?.apiKey || !creds?.apiSecret) {
    throw new HttpsError('failed-precondition', 'BCEL_NOT_CONFIGURED');
  }

  // TODO: replace with the real BCEL payment-initiation API call, e.g.:
  //   const res = await fetch('https://api.bcel.la/v1/payments', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${creds.apiKey}`, ... },
  //     body: JSON.stringify({ merchantId: creds.merchantId, amount, ... }),
  //   });
  //   const data = await res.json();
  //   return { ok: true, paymentUrl: data.paymentUrl, qrData: data.qrData };
  throw new HttpsError(
    'unimplemented',
    'BCEL_API_NOT_IMPLEMENTED — credentials are configured, but the actual API call in ' +
      'initiateBcelTopUp (wallet.ts) still needs to be written against BCEL\'s real API docs.'
  );
});

/**
 * Constant-time string comparison so signature checks can't be timed to
 * leak prefix matches.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Returns the exact request body bytes so the HMAC is computed over what the
 * bank actually sent (never a re-serialization, whose key order/whitespace
 * would break the signature).
 *
 *  - Cloud Functions (functions-framework) exposes `req.rawBody`.
 *  - The VPS backend (server.ts) captures the raw stream into `req.rawBody`
 *    before express.json() gets to it.
 *  - `Buffer` bodies (application/octet-stream) are used as-is.
 */
function rawBody(req: { rawBody?: unknown; body?: unknown }): Buffer {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody));
  if (Buffer.isBuffer(req.body)) return req.body;
  return Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
}

/**
 * BCEL webhook receiver (HTTPS endpoint, not a callable — bank webhooks
 * POST directly, not as a signed-in Firebase user). Once BCEL confirms a
 * payment, this credits the driver's wallet via the same helper the manual
 * approval flow uses.
 *
 * Fail-closed security posture:
 *   1. Disabled unless `secureConfig/bcel.webhookEnabled == true` AND a
 *      `webhookSecret` is set (both admin-configured in the dashboard).
 *   2. Requires an HMAC-SHA256 signature over the raw body, verified in
 *      constant time. Header name is configurable via
 *      `secureConfig/bcel.webhookSignatureHeader` (default x-bcel-signature)
 *      because bank conventions differ.
 *   3. Replay-safe: credited once per `referenceId` — a re-delivered callback
 *      is a no-op, never a second credit.
 *   4. Amount is validated against the walletConfig min/max top-up bounds.
 *
 * ⚠️ HMAC is a deliberate, documented choice — BCEL's real signing scheme may
 * differ (e.g. timestamp-nonce payloads or a different hash). When you get
 * their API docs, align `webhookSignatureHeader` + the HMAC construction with
 * their spec. Until `webhookEnabled` is switched on in the dashboard this
 * endpoint refuses everything, so there's no money-moving surface exposed.
 */
export const bcelWebhook = onRequest(async (req, res) => {
  try {
    const credsDoc = await db.collection('secureConfig').doc('bcel').get();
    const creds = credsDoc.data();
    const webhookSecret = creds?.webhookSecret;
    if (!creds || creds.webhookEnabled !== true || typeof webhookSecret !== 'string' || webhookSecret.length === 0) {
      res.status(503).send('BCEL webhook not enabled');
      return;
    }

    const signatureHeader = (creds.webhookSignatureHeader || 'x-bcel-signature').toLowerCase();
    const received = req.headers[signatureHeader];
    if (typeof received !== 'string' || received.length === 0) {
      res.status(401).send('Missing signature header');
      return;
    }
    const expected = createHmac('sha256', webhookSecret).update(rawBody(req)).digest('hex');
    if (!safeEqual(expected, received)) {
      res.status(401).send('Invalid signature');
      return;
    }

    const body = (req.body ?? {}) as { driverId?: unknown; amount?: unknown; referenceId?: unknown };
    const { driverId, amount, referenceId } = body;
    if (typeof driverId !== 'string' || driverId.length === 0 || driverId.length > 64) {
      res.status(400).send('Missing or invalid driverId');
      return;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).send('Missing or invalid amount');
      return;
    }
    if (typeof referenceId !== 'string' || referenceId.length === 0 || referenceId.length > 128) {
      res.status(400).send('Missing referenceId — required for replay protection');
      return;
    }

    const { min, max } = await topUpAmountBounds();
    if (amount < min || amount > max) {
      res.status(422).send(`Amount outside allowed range (${min}-${max})`);
      return;
    }

    await creditDriverWallet(driverId, amount, `BCEL auto top-up (ref: ${referenceId})`, referenceId);
    res.status(200).send('OK');
  } catch (err) {
    console.error('bcelWebhook error', err);
    res.status(500).send('Internal error');
  }
});
