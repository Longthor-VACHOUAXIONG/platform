import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';

/**
 * Server-maintained analytics counters.
 *
 * The dashboard used to derive revenue by pulling the 500 most recent
 * completed rides and summing `assignedFare` — that (a) capped the numbers at
 * 500 rides, and (b) reported gross fare rather than the business's actual
 * revenue (the commission). Firestore can't SUM across an unbounded result
 * set, so instead these counters are incremented transactionally alongside
 * the money movement itself (completeTrip, top-up approval) — the one place
 * they're guaranteed consistent with the wallet ledger.
 *
 * Docs:
 *   adminStats/rides        — lifetime ride totals + per-ride-type breakdown
 *   adminStats/wallets      — lifetime approved top-up totals
 *   adminStatsDaily/{day}   — per-calendar-day ride totals (Asia/Vientiane)
 *
 * All writes are Admin-SDK-only (the dashboard reads them via rules).
 */

const RIDES_STATS = db.collection('adminStats').doc('rides');
const WALLETS_STATS = db.collection('adminStats').doc('wallets');

/** Calendar day in Asia/Vientiane, e.g. "2026-08-11" — chart buckets must use
 * the business's local day, not the server's UTC day. */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Call inside the same transaction as the commission deduction so a crash
 * can't produce a wallet that's debited without the stats being counted. */
export function txRecordCompletedRide(
  tx: Transaction,
  fare: number,
  commission: number,
  rideTypeId: string | undefined
) {
  const rideType = rideTypeId || 'ride';
  tx.set(
    RIDES_STATS,
    {
      completedRides: FieldValue.increment(1),
      grossRevenueKip: FieldValue.increment(fare),
      commissionKip: FieldValue.increment(commission),
      [`byRideType.${rideType}.completedRides`]: FieldValue.increment(1),
      [`byRideType.${rideType}.grossRevenueKip`]: FieldValue.increment(fare),
      [`byRideType.${rideType}.commissionKip`]: FieldValue.increment(commission),
    },
    { merge: true }
  );
  tx.set(
    db.collection('adminStatsDaily').doc(dayKey(new Date())),
    {
      completedRides: FieldValue.increment(1),
      grossRevenueKip: FieldValue.increment(fare),
      commissionKip: FieldValue.increment(commission),
    },
    { merge: true }
  );
}

/** Call inside the same transaction as the wallet credit. */
export function txRecordTopUpApproved(tx: Transaction, amount: number) {
  tx.set(
    WALLETS_STATS,
    {
      topUpCount: FieldValue.increment(1),
      topUpApprovedKip: FieldValue.increment(amount),
    },
    { merge: true }
  );
}

const MAX_SCAN = 20000;

/**
 * Admin-only: recomputes adminStats + adminStatsDaily from the actual
 * completed rides and approved top-ups. Use after enabling the counters to
 * backfill history that predates them, or to correct drift.
 *
 * Historical commission is estimated at the *current* commissionRate (the old
 * code path didn't record per-ride commission), so figures can differ from
 * what was actually deducted if the rate changed over time.
 */
export const recomputeAdminStats = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!request.auth?.token.admin) {
    throw new HttpsError('permission-denied', 'Only an admin can recompute analytics.');
  }

  const commissionRate =
    (await db.collection('walletConfig').doc('default').get()).data()?.commissionRate ?? 0.1;

  let ridesScanned = 0;
  let fareSum = 0;
  let commissionSum = 0;
  const byRideType: Record<string, { completedRides: number; grossRevenueKip: number; commissionKip: number }> = {};
  const daily: Record<string, { completedRides: number; grossRevenueKip: number; commissionKip: number }> = {};

  let cursor: FirebaseFirestore.DocumentSnapshot | null = null;
  while (ridesScanned < MAX_SCAN) {
    let q = db
      .collection('rideRequests')
      .where('status', '==', 'completed')
      .orderBy('createdAt', 'desc');
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.limit(500).get();
    if (snap.empty) break;

    snap.forEach((d) => {
      const ride = d.data();
      const fare = ride.assignedFare ?? 0;
      const commission = Math.round(fare * commissionRate);
      fareSum += fare;
      commissionSum += commission;

      const type = (ride.rideTypeId as string) || 'ride';
      const bucket = (byRideType[type] ??= { completedRides: 0, grossRevenueKip: 0, commissionKip: 0 });
      bucket.completedRides += 1;
      bucket.grossRevenueKip += fare;
      bucket.commissionKip += commission;

      const created = ride.createdAt?.toDate ? ride.createdAt.toDate() : null;
      const key = created ? dayKey(created) : 'unknown';
      const day = (daily[key] ??= { completedRides: 0, grossRevenueKip: 0, commissionKip: 0 });
      day.completedRides += 1;
      day.grossRevenueKip += fare;
      day.commissionKip += commission;
    });

    ridesScanned += snap.size;
    cursor = snap.docs[snap.docs.length - 1];
  }

  let topUpCount = 0;
  let topUpKip = 0;
  let topUpsScanned = 0;
  let tCursor: FirebaseFirestore.DocumentSnapshot | null = null;
  while (topUpsScanned < MAX_SCAN) {
    let q = db
      .collectionGroup('walletTransactions')
      .where('type', '==', 'topup')
      .where('status', '==', 'approved')
      .orderBy('createdAt', 'desc');
    if (tCursor) q = q.startAfter(tCursor);
    const snap = await q.limit(500).get();
    if (snap.empty) break;

    snap.forEach((d) => {
      topUpCount += 1;
      topUpKip += d.data().amount ?? 0;
    });
    topUpsScanned += snap.size;
    tCursor = snap.docs[snap.docs.length - 1];
  }

  await Promise.all([
    db.collection('adminStats').doc('rides').set({
      completedRides: ridesScanned,
      grossRevenueKip: fareSum,
      commissionKip: commissionSum,
      byRideType,
      recomputedAt: FieldValue.serverTimestamp(),
    }),
    db.collection('adminStats').doc('wallets').set({
      topUpCount,
      topUpApprovedKip: topUpKip,
      recomputedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  const batch = db.batch();
  Object.entries(daily).forEach(([key, value]) => {
    batch.set(db.collection('adminStatsDaily').doc(key), value);
  });
  const today = dayKey(new Date());
  if (!daily[today]) {
    batch.set(db.collection('adminStatsDaily').doc(today), {
      completedRides: 0,
      grossRevenueKip: 0,
      commissionKip: 0,
    });
  }
  await batch.commit();

  return {
    ok: true,
    ridesScanned,
    topUpCount,
    grossRevenueKip: fareSum,
    commissionKip: commissionSum,
    truncated: ridesScanned >= MAX_SCAN || topUpsScanned >= MAX_SCAN,
  };
});
