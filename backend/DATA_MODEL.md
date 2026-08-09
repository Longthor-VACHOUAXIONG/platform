# Firestore data model

## `users/{uid}`
Rider account.
```ts
{
  role: 'rider',
  name: string,
  phone: string,
  photoUrl?: string,
  createdAt: Timestamp,
  rating: number,          // average rating given by drivers
  ratingCount: number,
}
```

## `drivers/{uid}`
Driver account + live status. Kept separate from `users` so driver fields
(vehicle, verification, location) don't bloat every read of a plain user.
```ts
{
  name: string,
  phone: string,
  photoUrl?: string,
  vehicleModel: string,
  plateNumber: string,
  verificationStatus: 'pending' | 'approved' | 'rejected',
  rating: number,
  ratingCount: number,
  totalRides: number,
  isOnline: boolean,
  currentLocation: GeoPoint | null,
  lastLocationAt: Timestamp | null,
  pushToken?: string,       // FCM token, set via the registerPushToken callable
  createdAt: Timestamp,
}
```

## `rideRequests/{rideId}`
The core matching document. Created by the rider, updated by Cloud Functions
and by drivers submitting offers (via subcollection).
```ts
{
  riderId: string,
  riderName: string,
  pickup: { label: string, geo: GeoPoint },
  destination: { label: string, geo: GeoPoint },
  rideTypeId: string,        // 'ride' | 'electro' | 'moto' | 'comfort' | 'courier'
  requestedFare: number,
  currency: 'LAK',
  status: 'searching' | 'offers_received' | 'driver_assigned' | 'in_progress' | 'completed' | 'cancelled',
  assignedDriverId: string | null,
  assignedFare: number | null,
  paymentMethod: 'cash',       // extension point — see README "Payments" section
  paymentStatus: 'n/a',        // becomes meaningful once a digital method exists
  geohashPrefix5: string,   // set client-side at creation, verified server-side — see geohash.ts
  cancelReason?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### `rideRequests/{rideId}/offers/{driverId}`
One doc per driver who makes an offer on this ride.
```ts
{
  driverId: string,
  driverName: string,
  vehicleModel: string,
  rating: number,
  totalRides: number,
  offeredFare: number,
  etaMinutes: number,
  status: 'pending' | 'accepted' | 'declined_by_rider' | 'withdrawn',
  createdAt: Timestamp,
}
```

### `rideRequests/{rideId}/ratings/{raterId}`
One doc per party who rated the other after completion. `raterId` is the rider's or driver's uid
— whoever submitted it. Written only by the `submitRating` Cloud Function.
```ts
{
  raterId: string,
  role: 'rider' | 'driver',   // who the rater was
  rating: number,             // 1-5
  comment: string | null,
  createdAt: Timestamp,
}
```

### `rideRequests/{rideId}/messages/{messageId}`
In-trip chat between the rider and their assigned driver.
```ts
{
  senderId: string,
  senderRole: 'rider' | 'driver',
  text: string,
  createdAt: Timestamp,
}
```

## `walletConfig/default`
Admin-controlled settings for the driver wallet system. **Public-readable** — drivers/riders need
the bank details and minimum balance. Never put secrets here; see `secureConfig/bcel` below.
```ts
{
  commissionRate: number,        // e.g. 0.10 = 10%, cut from wallet on trip completion
  minimumBalance: number,        // e.g. 50000 — driver can't go online below this
  currency: 'LAK',
  topUpMode: 'manual' | 'auto',  // manual = bank QR + admin approval; auto = BCEL API
  bankName: string,
  bankAccountName: string,
  bankAccountNumber: string,
  bankQrImageUrl: string | null, // uploaded QR code image, shown to drivers on the top-up screen
}
```

## `secureConfig/bcel`
Admin-only credentials for the BCEL auto top-up integration — a **separate** doc from
`walletConfig` on purpose. `walletConfig` is publicly readable (drivers need the bank details);
secrets must never live somewhere a client can read them. Only admins (custom claim) and Cloud
Functions (Admin SDK) can read this.
```ts
{
  merchantId: string,
  apiKey: string,
  apiSecret: string,      // never sent to any client — Cloud Functions only
  webhookSecret: string,  // verifies incoming BCEL webhook calls are genuine
}
```

## `drivers/{uid}` (additional field)
```ts
walletBalance: number   // LAK, can go negative after a commission deduction — that's what re-triggers the gate
```

### `drivers/{uid}/walletTransactions/{transactionId}`
Ledger of every balance change. Written only by Cloud Functions (never directly by the driver) so
a driver can't inflate their own balance.
```ts
{
  type: 'topup' | 'commission' | 'adjustment',
  amount: number,              // positive for topup/adjustment credit, negative for commission
  balanceAfter: number | null, // null while a topup is still 'pending'
  status: 'pending' | 'approved' | 'rejected' | 'completed',
  rideId: string | null,       // set for 'commission' transactions
  proofImageUrl: string | null,// set for 'topup' transactions (Storage URL)
  note: string | null,
  createdAt: Timestamp,
  reviewedAt: Timestamp | null,
  reviewedBy: string | null,   // admin uid who approved/rejected a topup
}
```
Admin-editable base pricing per zone/ride type — read by the Cloud Function
that validates/suggests fares.
```ts
{
  zoneName: string,
  baseFarePerKm: { ride: number, electro: number, moto: number, comfort: number },
  minimumFare: number,
  currency: 'LAK',
}
```

## Indexes needed
- `rideRequests`: composite index on `status` + `createdAt` (for admin live-rides view)
- `drivers`: composite index on `isOnline` + `verificationStatus` (for matching query)
