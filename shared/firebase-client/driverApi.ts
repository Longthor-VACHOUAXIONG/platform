import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  GeoPoint,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';

/** Toggle the driver's online/offline status and last known location. */
export async function setDriverOnline(uid: string, isOnline: boolean, coords?: { lat: number; lng: number }) {
  await updateDoc(doc(db, 'drivers', uid), {
    isOnline,
    ...(coords
      ? { currentLocation: new GeoPoint(coords.lat, coords.lng), lastLocationAt: serverTimestamp() }
      : {}),
  });
}

/** Periodic location ping while online (call every ~5-10s from a location watcher). */
export async function updateDriverLocation(uid: string, coords: { lat: number; lng: number }) {
  await updateDoc(doc(db, 'drivers', uid), {
    currentLocation: new GeoPoint(coords.lat, coords.lng),
    lastLocationAt: serverTimestamp(),
  });
}

/**
 * Live-subscribe to open ride requests (status still searching/offers_received).
 * NOTE: for a real launch, filter this server-side by proximity (e.g. via a
 * Cloud Function + GeoFirestore, or a geohash field) instead of pulling every
 * open request to every driver's device.
 */
export function listenToOpenRequests(cb: (rides: any[]) => void) {
  const q = query(
    collection(db, 'rideRequests'),
    where('status', 'in', ['searching', 'offers_received']),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Live-subscribe to a single ride the driver is assigned to. */
export function listenToAssignedRide(rideId: string, cb: (data: any) => void) {
  return onSnapshot(doc(db, 'rideRequests', rideId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
  });
}

export const submitOffer = httpsCallable<
  { rideId: string; offeredFare: number; etaMinutes: number },
  { ok: boolean }
>(functions, 'submitOffer');

export const startTrip = httpsCallable<{ rideId: string }, { ok: boolean }>(functions, 'startTrip');

export const completeTrip = httpsCallable<{ rideId: string }, { ok: boolean }>(
  functions,
  'completeTrip'
);
