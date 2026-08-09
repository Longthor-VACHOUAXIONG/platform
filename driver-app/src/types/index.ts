export type OpenRideRequest = {
  id: string;
  riderName: string;
  pickup: { label: string };
  destination: { label: string };
  rideTypeId: string;
  requestedFare: number;
  currency: string;
  status: string;
};

export type AssignedRide = {
  id: string;
  riderName: string;
  pickup: { label: string };
  destination: { label: string };
  assignedFare: number;
  status: 'driver_assigned' | 'in_progress' | 'completed';
};
