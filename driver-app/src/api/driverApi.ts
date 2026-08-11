import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  GeoPoint,
  serverTimestamp,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { ref, putFile, getDownloadURL } from '@react-native-firebase/storage';
import { db, functions, storage } from './firebaseConfig';
import { nearbyGeohashPrefixes } from '../utils/geohash';

/**
 * Uploads one driver-verification photo (ID/passport, driving license,
 * vehicle, or selfie) to `driverVerification/{driverId}/{kind}/{timestamp}.jpg`
 * and returns its download URL. Used during driver sign-up; the URLs are then
 * stored on the driver doc so the admin can review them in the dashboard.
 */
export async function uploadVerificationPhoto(driverId: string, kind: string, localFileUri: string): Promise<string> {
  const storageRef = ref(storage, `driverVerification/${driverId}/${kind}-${Date.now()}.jpg`);
  await putFile(storageRef, localFileUri);
  return getDownloadURL(storageRef);
}

/** Periodic location ping while online (call every ~5-10s from a location watcher). */
export async function updateDriverLocation(uid: string, coords: { lat: number; lng: number }) {
  await updateDoc(doc(db, 'drivers', uid), {
    currentLocation: new GeoPoint(coords.lat, coords.lng),
    lastLocationAt: serverTimestamp(),
  });
}

const OPEN_STATUSES = new Set(['searching', 'offers_received']);

/**
 * Live-subscribe to open ride requests near the driver's current location.
 * Queries only the geohash cells around (lat, lng) instead of every open
 * request city-wide — this is the fix for the "every driver sees every
 * request" scaling problem. Firestore only allows one `in` filter per
 * query, so `status` is filtered client-side after the geohash-scoped
 * fetch; that's fine since the geohash filter already narrows results to a
 * small geographic area.
 *
 * Re-call this (the screen re-subscribes) whenever the driver's location
 * moves enough to potentially change which geohash cells are relevant —
 * see the `region` effect in HomeScreen.
 */
export function listenToOpenRequests(
  driverLocation: { lat: number; lng: number },
  cb: (rides: (DocumentData & { id: string })[]) => void,
  radiusKm = 5
) {
  const prefixes = nearbyGeohashPrefixes(driverLocation.lat, driverLocation.lng, radiusKm);

  const q = query(collection(db, 'rideRequests'), where('geohashPrefix5', 'in', prefixes));
  return onSnapshot(q, (snap) => {
    const rides = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r: any) => OPEN_STATUSES.has(r.status));
    cb(rides);
  });
}

/** Live-subscribe to a single ride the driver is assigned to. */
export function listenToAssignedRide(rideId: string, cb: (data: DocumentData & { id: string }) => void) {
  return onSnapshot(doc(db, 'rideRequests', rideId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
  });
}

export const submitOffer = (data: { rideId: string; offeredFare: number; etaMinutes: number }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'submitOffer')(data);

export const startTrip = (data: { rideId: string }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'startTrip')(data);

export const completeTrip = (data: { rideId: string }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'completeTrip')(data);

export const submitRating = (data: { rideId: string; rating: number; comment?: string }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'submitRating')(data);

/** One-time fetch of the driver's completed trips, most recent first — also used for earnings. */
export async function fetchTripHistory(driverId: string, limitCount = 100) {
  const q = query(
    collection(db, 'rideRequests'),
    where('assignedDriverId', '==', driverId),
    where('status', '==', 'completed'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export type ChatMessage = {
  senderId: string;
  senderRole: 'rider' | 'driver';
  text: string;
};

/**
 * Send a chat message on an active ride. Goes through the `sendChatMessage`
 * callable so the VPS backend can push a notification to the rider (Firestore
 * triggers don't exist on the plain server, so a direct addDoc here would
 * leave driver→rider messages unpushed). The sender is taken from the
 * authenticated ID token, not passed by the client.
 */
export const sendMessage = (rideId: string, _senderId: string, text: string) =>
  httpsCallable<{ rideId: string; text: string }, { ok: boolean }>(
    functions,
    'sendChatMessage'
  )({ rideId, text });

/** Live-subscribe to a ride's chat, oldest first. */
export function listenToMessages(rideId: string, cb: (messages: (ChatMessage & { id: string })[]) => void) {
  const q = query(collection(db, 'rideRequests', rideId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage & { id: string })));
  });
}
