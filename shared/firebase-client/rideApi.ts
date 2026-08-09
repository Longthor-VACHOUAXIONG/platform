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
  GeoPoint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Live-subscribe to a single ride request's status. */
export function listenToRide(rideId: string, cb: (data: any) => void) {
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

export const acceptOffer = httpsCallable<{ rideId: string; driverId: string }, { ok: boolean }>(
  functions,
  'acceptOffer'
);

export const cancelRide = httpsCallable<{ rideId: string; reason?: string }, { ok: boolean }>(
  functions,
  'cancelRide'
);

export const getRecommendedFare = httpsCallable<
  {
    pickup: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    rideTypeId: string;
    zoneId: string;
  },
  { fare: number; currency: string; distanceKm: number }
>(functions, 'getRecommendedFare');
