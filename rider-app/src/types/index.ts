export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Place = {
  id: string;
  label: string;      // e.g. "Khouvieng Road"
  subLabel?: string;   // e.g. "Entrance"
  coords: LatLng;
};

export type RideType = {
  id: string;
  name: string;          // "Ride", "Electro", "Moto", "Comfort", "Couriers"
  description: string;   // "Affordable fares"
  capacity?: number;
  etaMinutes: number;
  estimatedFare?: number; // null for "Couriers" style entries with no fixed estimate
  icon: string;           // key into an icon map / emoji fallback
};

export type FareOffer = {
  id: string;
  amount: number;
  currency: string; // "LAK"
};

export type Driver = {
  id: string;
  name: string;
  rating: number;
  totalRides: number;
  vehicleModel: string;
  avatarUrl?: string;
  etaMinutes: number;
  offeredFare: number;
};

export type RideRequestStatus =
  | 'idle'
  | 'searching'
  | 'offers_received'
  | 'driver_assigned'
  | 'cancelled';

export type RideRequest = {
  id: string;
  pickup: Place;
  destination: Place;
  rideType: RideType;
  fare: number;
  currency: string;
  status: RideRequestStatus;
  createdAt: number;
};
