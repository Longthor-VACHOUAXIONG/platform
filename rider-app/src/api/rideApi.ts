import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { db, functions } from './firebaseConfig';

export type RideStatus =
  | 'searching'
  | 'offers_received'
  | 'driver_assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type RideOffer = {
  driverId: string;
  driverName: string;
  vehicleModel: string;
  rating: number;
  totalRides: number;
  offeredFare: number;
  etaMinutes: number;
  status: 'pending' | 'accepted' | 'declined_by_rider' | 'withdrawn';
};

/** Rider creates a new ride request. Returns the new ride's Firestore ID. */
export async function createRideRequest(params: {
  riderId: string;
  riderName: string;
  pickup: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
  rideTypeId: string;
  requestedFare: number;
}) {
  // The doc is created server-side by the `requestRide` callable (the VPS
  // backend can't run Firestore triggers, so creation + nearby-driver
  // matching + push notifications happen in this one call). The authenticated
  // rider's uid is taken from their ID token, never from the payload.
  const res = await httpsCallable<
    Omit<typeof params, 'riderId'>,
    { rideId: string }
  >(functions, 'requestRide')({
    riderName: params.riderName,
    pickup: params.pickup,
    destination: params.destination,
    rideTypeId: params.rideTypeId,
    requestedFare: params.requestedFare,
  });
  return res.data.rideId;
}

/** Live-subscribe to a single ride request's status. */
export function listenToRide(rideId: string, cb: (data: DocumentData & { id: string }) => void) {
  return onSnapshot(doc(db, 'rideRequests', rideId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
  });
}

/** Live-subscribe to the list of driver offers on a ride, most recent first. */
export function listenToOffers(rideId: string, cb: (offers: RideOffer[]) => void) {
  const q = query(
    collection(db, 'rideRequests', rideId, 'offers'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as RideOffer));
  });
}

export const acceptOffer = (data: { rideId: string; driverId: string }) =>
  httpsCallable<{ rideId: string; driverId: string }, { ok: boolean }>(functions, 'acceptOffer')(data);

export const cancelRide = (data: { rideId: string; reason?: string }) =>
  httpsCallable<{ rideId: string; reason?: string }, { ok: boolean }>(functions, 'cancelRide')(data);

export const getRecommendedFare = (data: {
  pickup: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  rideTypeId: string;
  zoneId: string;
}) =>
  httpsCallable<typeof data, { fare: number; currency: string; distanceKm: number }>(
    functions,
    'getRecommendedFare'
  )(data);

export const submitRating = (data: { rideId: string; rating: number; comment?: string }) =>
  httpsCallable<typeof data, { ok: boolean }>(functions, 'submitRating')(data);

export type ChatMessage = {
  senderId: string;
  senderRole: 'rider' | 'driver';
  text: string;
};

/** Send a chat message on an active ride. Goes through the `sendChatMessage`
 * callable so the VPS backend can push a notification to the driver (the old
 * Firestore-trigger-based push doesn't exist on a plain server). The sender
 * is taken from the authenticated ID token, not passed by the client. */
export async function sendMessage(rideId: string, text: string) {
  await httpsCallable<{ rideId: string; text: string }, { ok: boolean }>(
    functions,
    'sendChatMessage'
  )({ rideId, text });
}

/** Live-subscribe to a ride's chat, oldest first. */
export function listenToMessages(rideId: string, cb: (messages: (ChatMessage & { id: string })[]) => void) {
  const q = query(collection(db, 'rideRequests', rideId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage & { id: string })));
  });
}

/** One-time fetch of the rider's completed trips, most recent first. */
export async function fetchTripHistory(riderId: string, limitCount = 50) {
  const q = query(
    collection(db, 'rideRequests'),
    where('riderId', '==', riderId),
    where('status', '==', 'completed'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
