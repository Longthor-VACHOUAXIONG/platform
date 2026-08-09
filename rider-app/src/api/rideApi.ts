import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  orderBy,
  limit,
  getDocs,
  GeoPoint,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { db, functions } from './firebaseConfig';
import { geohashEncode } from '../utils/geohash';

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
  const ref = await addDoc(collection(db, 'rideRequests'), {
    riderId: params.riderId,
    riderName: params.riderName,
    pickup: { label: params.pickup.label, geo: new GeoPoint(params.pickup.lat, params.pickup.lng) },
    destination: {
      label: params.destination.label,
      geo: new GeoPoint(params.destination.lat, params.destination.lng),
    },
    rideTypeId: params.rideTypeId,
    requestedFare: params.requestedFare,
    currency: 'LAK',
    status: 'searching' as RideStatus,
    assignedDriverId: null,
    assignedFare: null,
    // Cash-only for now — see README "Payments" for the extension point
    // once you pick a digital payment provider.
    paymentMethod: 'cash' as const,
    paymentStatus: 'n/a' as const,
    // Lets the driver app query "open requests near me" directly, instead of
    // pulling every open request city-wide. The onRideRequestCreated Cloud
    // Function recomputes this server-side too, as a sanity check.
    geohashPrefix5: geohashEncode(params.pickup.lat, params.pickup.lng, 5),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
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

/** Send a chat message on an active ride. */
export async function sendMessage(rideId: string, senderId: string, text: string) {
  await addDoc(collection(db, 'rideRequests', rideId, 'messages'), {
    senderId,
    senderRole: 'rider' as const,
    text,
    createdAt: serverTimestamp(),
  });
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
