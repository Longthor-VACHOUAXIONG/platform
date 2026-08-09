import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, GeoPoint } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';

const DEFAULT_MINIMUM_BALANCE = 50000;

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

/** Driver submits a top-up request after manually transferring via bank QR. */
export const requestTopUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { amount, proofImageUrl } = request.data as { amount: number; proofImageUrl?: string };
  if (!amount || amount <= 0) {
    throw new HttpsError('invalid-argument', 'A positive amount is required.');
  }

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
 */
async function creditDriverWallet(driverId: string, amount: number, note: string) {
  const driverRef = db.collection('drivers').doc(driverId);
  const txnRef = driverRef.collection('walletTransactions').doc();

  await db.runTransaction(async (tx) => {
    const driverDoc = await tx.get(driverRef);
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver not found.');

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
  if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'A positive amount is required.');

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
 * BCEL webhook receiver (HTTPS endpoint, not a callable — bank webhooks
 * POST directly, not as a signed-in Firebase user). Once BCEL confirms a
 * payment, this credits the driver's wallet via the same helper the manual
 * approval flow uses.
 *
 * ⚠️ Signature verification below is a placeholder — replace with BCEL's
 * actual webhook-signing scheme before relying on this. Without real
 * verification, anyone who finds this URL could credit arbitrary wallets.
 */
export const bcelWebhook = onRequest(async (req, res) => {
  try {
    const credsDoc = await db.collection('secureConfig').doc('bcel').get();
    const webhookSecret = credsDoc.data()?.webhookSecret;

    // TODO: verify the request is genuinely from BCEL using their signing
    // scheme (e.g. an HMAC header checked against `webhookSecret`) — do NOT
    // deploy this to production without real verification here.
    if (!webhookSecret) {
      res.status(503).send('BCEL webhook secret not configured');
      return;
    }

    const { driverId, amount, referenceId } = req.body as {
      driverId: string;
      amount: number;
      referenceId: string;
    };
    if (!driverId || !amount) {
      res.status(400).send('Missing driverId or amount');
      return;
    }

    await creditDriverWallet(driverId, amount, `BCEL auto top-up (ref: ${referenceId ?? 'n/a'})`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('bcelWebhook error', err);
    res.status(500).send('Internal error');
  }
});
