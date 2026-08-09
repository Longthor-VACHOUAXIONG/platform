import { Driver, RideType } from '../types';

export const rideTypes: RideType[] = [
  {
    id: 'ride',
    name: 'Ride',
    description: 'Affordable fares',
    capacity: 4,
    etaMinutes: 3,
    estimatedFare: 38500,
    icon: 'car',
  },
  {
    id: 'electro',
    name: 'Electro',
    description: 'Eco-friendly rides',
    capacity: 4,
    etaMinutes: 3,
    estimatedFare: 50500,
    icon: 'car-electric',
  },
  {
    id: 'moto',
    name: 'Moto',
    description: 'No traffic, lower prices',
    capacity: 1,
    etaMinutes: 4,
    estimatedFare: 24000,
    icon: 'motorbike',
  },
  {
    id: 'courier',
    name: 'Couriers',
    description: 'Request package delivery, up to 20kg',
    etaMinutes: 0,
    icon: 'package',
  },
  {
    id: 'comfort',
    name: 'Comfort',
    description: 'Newer cars',
    capacity: 4,
    etaMinutes: 4,
    estimatedFare: 46500,
    icon: 'car-comfort',
  },
];

export const mockDrivers: Driver[] = [
  {
    id: 'd1',
    name: 'Silaxay',
    rating: 4.82,
    totalRides: 103,
    vehicleModel: 'Baojun 730',
    etaMinutes: 6,
    offeredFare: 46500,
  },
  {
    id: 'd2',
    name: 'Bounmi',
    rating: 4.98,
    totalRides: 1558,
    vehicleModel: 'Honda E NS1',
    etaMinutes: 3,
    offeredFare: 42500,
  },
  {
    id: 'd3',
    name: 'Sonesacksith',
    rating: 4.94,
    totalRides: 293,
    vehicleModel: 'Geely EX2',
    etaMinutes: 3,
    offeredFare: 42500,
  },
];
