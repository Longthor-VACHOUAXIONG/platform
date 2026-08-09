import { doc, onSnapshot, collection, query, orderBy } from '@react-native-firebase/firestore';
import { httpsCallable, FunctionsError } from '@react-native-firebase/functions';
import { ref, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { db, functions, storage } from './firebaseConfig';

export type WalletConfig = {
  commissionRate: number;
  minimumBalance: number;
  currency: string;
  topUpMode: 'manual' | 'auto';
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankQrImageUrl: string | null;
};

export type WalletTransaction = {
  id: string;
  type: 'topup' | 'commission' | 'adjustment';
  amount: number;
  balanceAfter: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  rideId: string | null;
  proofImageUrl: string | null;
  note: string | null;
  createdAt: { toDate: () => Date } | null;
};

/** Live-subscribe to the admin-configured wallet settings (commission, minimum balance, bank details). */
export function listenToWalletConfig(cb: (config: WalletConfig | null) => void) {
  return onSnapshot(doc(db, 'walletConfig', 'default'), (snap) => {
    cb(snap.exists() ? (snap.data() as WalletConfig) : null);
  });
}

/** Live-subscribe to the driver's own wallet balance. */
export function listenToWalletBalance(driverId: string, cb: (balance: number) => void) {
  return onSnapshot(doc(db, 'drivers', driverId), (snap) => {
    cb(snap.data()?.walletBalance ?? 0);
  });
}

/** Live-subscribe to the driver's own transaction history, most recent first. */
export function listenToWalletTransactions(driverId: string, cb: (txns: WalletTransaction[]) => void) {
  const q = query(collection(db, 'drivers', driverId, 'walletTransactions'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletTransaction)));
  });
}

export type InsufficientBalanceInfo = { balance: number; minimumBalance: number; shortfall: number };

/**
 * Toggles online/offline through the balance-gated Cloud Function (not a
 * direct Firestore write — see firestore.rules for why). Throws on failure;
 * check `isInsufficientBalanceError` to detect the balance-gate case
 * specifically vs. other failures.
 */
export async function setOnlineStatus(isOnline: boolean, coords?: { lat: number; lng: number }) {
  const fn = httpsCallable<{ isOnline: boolean; lat?: number; lng?: number }, { ok: boolean }>(
    functions,
    'setOnlineStatus'
  );
  await fn({ isOnline, ...coords });
}

export function isInsufficientBalanceError(
  err: unknown
): err is FunctionsError & { details: InsufficientBalanceInfo } {
  return err instanceof FunctionsError && err.code === 'functions/failed-precondition';
}

/** Uploads a payment-proof photo and returns its download URL. */
export async function uploadTopUpProof(driverId: string, localFileUri: string): Promise<string> {
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `walletProofs/${driverId}/${fileName}`);
  await putFile(storageRef, localFileUri);
  return getDownloadURL(storageRef);
}

/** Submits a top-up request for admin review (manual mode). */
export async function requestTopUp(amount: number, proofImageUrl?: string) {
  const fn = httpsCallable<{ amount: number; proofImageUrl?: string }, { ok: boolean; transactionId: string }>(
    functions,
    'requestTopUp'
  );
  return fn({ amount, proofImageUrl });
}

/**
 * Kicks off a BCEL auto top-up (only meaningful once an admin has switched
 * walletConfig.topUpMode to 'auto' and filled in secureConfig/bcel). Throws
 * with code 'functions/unimplemented' if the backend BCEL API call itself
 * hasn't been wired up yet (see wallet.ts on the backend) — callers should
 * treat that as "not ready yet, ask your admin" rather than a hard error.
 */
export async function initiateBcelTopUp(amount: number) {
  const fn = httpsCallable<{ amount: number }, { ok: boolean; paymentUrl?: string; qrData?: string }>(
    functions,
    'initiateBcelTopUp'
  );
  return fn({ amount });
}
