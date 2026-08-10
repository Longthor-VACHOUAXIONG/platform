# GoFair — full platform

A fare-negotiation ride-hailing platform: riders set a fare, nearby drivers make competing offers,
the rider picks one. Four pieces, one Firebase project underneath:

```
platform/
├── backend/          Firebase project: Firestore rules/indexes, Cloud Functions (ride lifecycle, pricing, admin roles)
├── rider-app/         Expo/React Native — riders request & pay for rides
├── driver-app/        Expo/React Native — drivers go online, offer fares, run trips
├── admin-dashboard/   React (Vite) web app — ops team verifies drivers, watches live rides, sets pricing
└── shared/            Reference copies of the Firebase client files used by each app
```

All three apps point at the **same Firebase project**, so a ride created in the rider app is
immediately visible to the driver app and the admin dashboard.

## 1. Set up Firebase (do this first)

1. Create a project at https://console.firebase.google.com
2. Enable **Authentication** (Email/Password for admin, plus whatever you choose for riders/drivers — see the auth note below)
3. Enable **Firestore** (production mode)
4. Enable **Cloud Functions** (requires the Blaze pay-as-you-go plan — the free Spark plan can't run Functions)
5. Get your web app config: Project Settings → General → Your apps → Add app → Web. Copy the config object.
6. Paste that config into the `firebaseConfig` object in **all three** of:
   - `rider-app/src/api/firebaseConfig.ts`
   - `driver-app/src/api/firebaseConfig.ts`
   - `admin-dashboard/src/lib/firebaseConfig.ts`

## 2. Deploy the backend

```bash
cd backend
npm install -g firebase-tools   # if you don't have it
firebase login
firebase use --add              # pick your project
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Then seed at least one pricing zone (Firestore console → `pricingConfig` collection → add a
document, or just use the admin dashboard's "Add zone" once it's running).

### Create your first admin

Cloud Functions can't self-bootstrap the first admin (nothing to check permissions against yet):

```bash
cd backend/scripts
# 1. Firebase Console → Project Settings → Service Accounts → Generate new private key
#    save it as serviceAccountKey.json in this folder
# 2. Create yourself an Auth user (Firebase Console → Authentication → Add user, email+password)
# 3. Copy that user's UID, then:
npx ts-node bootstrap-admin.ts <your-uid>
```

## 3. Run each app

```bash
cd rider-app && npm install && npx expo start
cd driver-app && npm install && npx expo start
cd admin-dashboard && npm install && npm run dev
```

Each has its own README/inline comments for specifics.

## Auth — now real phone OTP (rider + driver)

Rider and driver sign-up use **real phone-number verification** via `@react-native-firebase/auth`
(native modules, not the Firebase JS SDK — the JS SDK's phone auth needs a browser reCAPTCHA
widget that doesn't exist on native, and Expo's old shim for it was removed in SDK 48).

Because of this, **rider-app and driver-app can no longer run in plain Expo Go** — they now bundle
native modules. Before you can run them:

1. In the Firebase Console, add an iOS app and an Android app to your project (Project Settings →
   Add app). Download `GoogleService-Info.plist` and `google-services.json` and place them at the
   root of `rider-app/` and `driver-app/` respectively (each app needs its own pair, since they
   have different bundle IDs — see `app.json`).
2. In Firebase Console → Authentication → Sign-in method, enable **Phone**.
3. Build a dev client instead of using Expo Go:
   ```bash
   npx expo prebuild
   eas build --profile development   # or: npx expo run:ios / run:android locally
   ```
4. From then on, `npx expo start --dev-client` works like `expo start` did before.

Admin auth is unchanged — real email/password via the Firebase JS SDK, which is fine for a web
app (no native module needed there). Add 2FA later if your Firebase plan supports it.

### Still not done
- Nothing. Rider push notifications are now wired end-to-end (see below) — riders
  get a push on chat messages, trip start, and trip completion, using the same
  FCM pattern the driver app uses.

## iOS builds

Everything above (EAS dev client, phone auth, push) works the same on iOS, with a few extra
requirements Android doesn't have:

1. **Apple Developer Program membership** ($99/year) — required for any device build, dev or
   production. Enroll at https://developer.apple.com/programs
2. In `eas build --profile development --platform ios`, EAS will prompt to either let it manage
   your certificates/provisioning profiles automatically (recommended — choose "Yes" when asked)
   or use ones you generate manually in the Apple Developer portal.
3. **Push notifications need an APNs key** uploaded to Firebase: Apple Developer portal → Certificates,
   Identifiers & Profiles → Keys → create a key with the "Apple Push Notifications service (APNs)"
   capability → download the `.p8` file (you only get one chance to download it). Then Firebase
   Console → Project Settings → Cloud Messaging → Apple app configuration → upload that key.
4. Installing a dev build on your own iPhone: EAS gives you an install link/QR after the build
   finishes, same as Android — but the first time, you'll need to trust the developer certificate
   on-device (Settings → General → VPN & Device Management → trust your Apple ID/team).
5. `google-services.json`/`GoogleService-Info.plist` are already referenced correctly in `app.json`
   for both platforms — no separate iOS config needed there beyond what §1 of the main setup guide
   covers.

Everything else — `eas build:configure`, `npx expo start --dev-client`, test phone numbers in
Firebase Console — works identically to the Android instructions earlier in this README.

## Geo-filtered driver matching

Fixed the scaling problem where every online driver's app pulled every open ride request
city-wide:

- Each ride request gets a **geohash** (`geohashPrefix5`, 5-char precision ≈ 5km cells) — set
  client-side at creation (`rideApi.ts`) so it's there immediately, and re-verified server-side in
  the `onRideRequestCreated` trigger.
- The driver app queries only the **3×3 grid of geohash cells** around its current location
  (`nearbyGeohashPrefixes` in `src/utils/geohash.ts`) instead of every open request — see
  `listenToOpenRequests` in `driverApi.ts`. It re-subscribes when the driver moves more than ~1km.
- **Bonus fix**: the Firestore security rules previously only let a driver read a ride request
  they were *already assigned to* — meaning the old "browse open requests" query would have been
  silently denied for every driver. Rules now also allow reading requests with `status` in
  `searching`/`offers_received`, so any signed-in driver can see (and offer on) open requests.

This is a fixed-precision-cell approach (not full geohash bit-range queries like GeoFirestore
uses) — simpler to reason about and fast enough for a single-city pilot. If you outgrow ~5km cells
holding too many concurrent requests, that's the point to move to a proper geo-indexing library.

## In-app chat

Riders and drivers can message each other once a ride is assigned, via a `messages` subcollection
on each ride request:

- **Backend**: `firestore.rules` scopes read/write to the ride's rider and assigned driver only.
  `onChatMessageCreated` (a Firestore trigger) pushes a notification to the *rider* when the driver
  sends a message.
- **Both apps**: a chat button on the trip-in-progress screen opens `ChatScreen` — a live message
  list + input, translated in all three languages.
- **Rider push notifications**: riders now register an FCM token too (same pattern as the driver
  app's `pushNotifications.ts` — token saved via the `registerRiderPushToken` callable, background
  handler in `index.ts`). `sendChatMessage` pushes to whichever party *isn't* the sender, and
  `startTrip`/`completeTrip` push to the rider so a backgrounded rider still hears about trip
  events.

## Admin analytics

The dashboard's **Analytics** page (`AnalyticsPage.tsx`) shows total revenue, completed ride count,
currently-online driver count, pending driver approvals, and a 7-day completed-rides bar chart
(`recharts`). All computed client-side from a capped Firestore query (last 500 completed rides) —
fine at pilot scale; move aggregation into a scheduled Cloud Function writing pre-computed daily
stats if you need this to scale past a few thousand rides.

## Payments

Payment model: **manual driver-wallet deposits + automatic commission deduction** — no payment
gateway involved.

- Every ride request carries `paymentMethod: 'wallet'` and `paymentStatus: 'n/a'` (see
  `DATA_MODEL.md`).
- The rider pays the driver directly at trip end; the platform's cut is handled by the driver
  wallet: a driver tops up their wallet manually (bank QR transfer + proof screenshot, admin
  approves), and `completeTrip` auto-deducts `commissionRate × fare` from that balance in the same
  transaction that marks the ride complete.
- A driver can't even go online below the configured minimum balance, so there's always enough in
  the wallet to cover commission on a trip.
- If you later want a real digital rail, the extension point is unchanged: rider app calls the
  provider's SDK, a Cloud Function verifies the webhook and flips `paymentStatus` to `'paid'`,
  and `completeTrip` remains where the payout/settlement record would go.

## Driver wallet

Every driver has a wallet balance (`drivers/{uid}.walletBalance`), auto-debited by commission on
each completed trip, and gated so a driver can't go online below a configurable minimum:

- **Commission**: `completeTrip` (in `rideLifecycle.ts`) deducts `commissionRate × fare` from the
  driver's wallet in the same transaction that marks the ride complete, and logs a `commission`
  entry in `drivers/{uid}/walletTransactions`. Rate is admin-configurable (`walletConfig/default`).
- **Balance gate**: `setOnlineStatus` (a Cloud Function, not a direct Firestore write — see the
  security note below) checks the driver's balance against `walletConfig.minimumBalance` before
  allowing `isOnline: true`. Below the minimum, the driver app shows a forced "top up to go
  online" modal instead of letting the toggle turn on.
- **Top-up (manual, bank QR)**: driver app's Top Up screen shows the admin-configured bank name/
  account/QR image, the driver enters the amount they transferred and attaches a payment-proof
  screenshot (uploaded to Firebase Storage), which creates a `pending` transaction. Admin
  dashboard's **Top-up requests** page lists every pending request (across all drivers, via a
  Firestore collection-group query) with the proof image, and Approve/Reject credits or dismisses
  it via the `reviewTopUp` Cloud Function.
- **Admin settings**: commission rate, minimum balance, and bank details/QR are all editable from
  the dashboard's **Wallet settings** page — no code changes needed to adjust them.
- **Auto top-up (BCEL API) — credentials/toggle now fully admin-configurable, API call still a
  stub.** `secureConfig/bcel` (admin-only Firestore doc, separate from `walletConfig` since that
  one's public-readable) holds the merchant ID/API key/secret/webhook secret — all editable from
  the dashboard's Wallet Settings page. Once those are filled in, the `'auto'` option in the
  Top-up mode dropdown unlocks. `initiateBcelTopUp` (driver-facing) and `bcelWebhook` (receives
  BCEL's payment confirmation) are both wired end-to-end — driver app calls one, backend credits
  the wallet via the other — **except the actual `fetch()` call to BCEL's API and the webhook's
  signature verification are TODO-marked stubs**, because I don't have BCEL's API documentation
  (endpoint, auth scheme, request/response shape). I can't respons­ibly guess at a bank's private
  API contract. When you get BCEL access: fill in the two TODOs in `backend/functions/src/wallet.ts`
  against their real docs — everything else (credentials flow, driver UI, wallet crediting,
  webhook plumbing) needs no other changes.

**Security note**: drivers cannot write their own `walletBalance`, `isOnline`, `verificationStatus`,
or `rating` directly — `firestore.rules` locks those to an explicit allowlist of client-writable
fields, everything else only changes via Cloud Functions (Admin SDK, bypasses rules). This was a
real gap in the original rules (a driver could otherwise have set their own balance or approval
status) — worth knowing if you extend the driver schema further: add new trust/financial fields to
the *deny* side by default, not the allowlist.

## Self-hosted maps

Google Maps (tiles, Directions API, Geocoding API) has been fully replaced with a self-hosted
stack you run on your own VPS — see `/infra/README.md` for setup. Summary:

- **Tiles**: a raster OSM tile server (`overv/openstreetmap-tile-server`), rendered via
  **MapLibre** (`@maplibre/maplibre-react-native`) instead of `react-native-maps` — this swap was
  necessary because `react-native-maps` always uses the Google Maps SDK natively on Android, so
  there's no way to point it at custom tiles without still depending on Google there. MapLibre has
  no Google/Apple dependency at all.
- **Routing**: OSRM, replacing the Google Directions API call in `utils/directions.ts` — same
  output shape (distance, duration, route polyline), just pointed at your own `:5000` endpoint.
- **Geocoding**: Nominatim, replacing the native reverse-geocoder in `utils/geocode.ts`, pointed
  at your own `:8080` endpoint.
- Both apps' `app.json` allow plain HTTP to the VPS IP (Android cleartext + iOS ATS exceptions) —
  fine for testing, but see `/infra/README.md` "Production hardening" for moving to HTTPS behind a
  domain before real users depend on it.

**Not yet done**: this was rider-app-first; the exact same MapLibre/OSRM/Nominatim swap has been
applied to driver-app too (same `OsmMapView` component, same config), but driver-app doesn't call
Directions/geocoding itself (it just displays labels the rider app already resolved), so only the
map-tile piece was needed there.

## Language support (rider app)

The rider app supports **English, Lao, and Chinese** via `i18next`/`react-i18next`. Defaults to
English on first launch (no device-locale auto-detect, per product decision); the person can
switch anytime from the Home screen's menu button, and their choice persists across app restarts
(`AsyncStorage`).

- `src/i18n/locales/{en,lo,zh}.json` — all UI strings, one file per language
- `src/i18n/index.ts` — init, language list, `setLanguage()` / `restoreSavedLanguage()`
- `src/components/LanguageSwitcherModal.tsx` — the picker UI

To add a string: add the key to `en.json` first (source of truth), then add matching keys to
`lo.json`/`zh.json`, then reference it with `t('namespace.key')` in the screen. To add another
language: add a locale file, register it in `src/i18n/index.ts`'s `resources` and
`SUPPORTED_LANGUAGES`.

**Not yet localized**: nothing — rider app, driver app, and admin dashboard all support
English/Lao/Chinese now, same `i18next` pattern in each (web admin dashboard persists the choice
via `localStorage` instead of `AsyncStorage`, otherwise identical).

## Ratings & trip history

Either party rates the other after a completed trip:

- **Backend**: `submitRating` Cloud Function — either the rider or the assigned driver of a
  *completed* ride can call it once (a second call from the same person overwrites their own
  rating rather than creating a duplicate). Updates the target's `rating`/`ratingCount` via a
  running-average transaction. Stored per-ride in `rideRequests/{rideId}/ratings/{raterId}`.
- **Rider app**: `TripInProgressScreen` now actually listens for live ride status instead of being
  static, and routes to `RateDriverScreen` (5-star + optional comment) the moment the driver marks
  the trip complete. `TripHistoryScreen` (reachable from the Home screen's menu) lists past
  completed trips.
- **Driver app**: same pattern — completing a trip routes to `RateRiderScreen`; `TripHistoryScreen`
  doubles as an **earnings** summary (total + per-trip list), reachable from an "Earnings" button
  on the driver Home screen.

Fixed two bugs found while wiring this up: the rider's trip screen was static (never actually
tracked whether the driver started/completed the trip), and its "back to home" copy included a
dev-only note that was visible to real users.

## Push notifications (driver app)

Drivers now get a real push when a new nearby request appears, and when a rider accepts their
offer — via `@react-native-firebase/messaging` (FCM), wired end-to-end:

- **Backend**: `rideMatching.ts` sends a push to every matched driver's `pushToken` when a ride is
  created; `rideLifecycle.ts` pushes to the winning driver when their offer is accepted.
- **Driver app**: `src/api/pushNotifications.ts` requests permission, gets an FCM token, and saves
  it via the `registerPushToken` Cloud Function on every sign-in (call site: `HomeScreen`). A
  background handler is registered in `index.ts` (must run outside the React tree) so pushes are
  received even when the app is fully closed.

To finish setting this up:
1. In Firebase Console → Project Settings → Cloud Messaging, note your Server Key isn't needed
   (Cloud Functions use the Admin SDK, which is already authorized) — nothing to configure there.
2. **iOS only**: push notifications need an APNs key uploaded to Firebase (Project Settings →
   Cloud Messaging → Apple app configuration) and the Push Notifications capability enabled in
   your Apple Developer account/Xcode project.
3. Test by toggling a driver online in the driver app, then creating a ride request nearby in the
   rider app (or directly in the Firestore console) — the driver should get a push within a
   couple seconds.

## Architecture notes / known gaps to close before launch

- **Driver matching** currently pulls *all* open ride requests to *every* online driver's device
  and filters client-side by nothing (see `driverApi.ts` TODO). Fine for a pilot in one small city;
  before scaling, add geohash-based querying (e.g. GeoFirestore) so drivers only see nearby requests.
- **Fare estimation** uses road distance from the self-hosted OSRM (with a straight-line haversine
  fallback if the routing service is down), so recommended fares match real driving distance —
  see `getRecommendedFare` in `pricing.ts`.
- **Payments** are the manual driver-wallet flow described in the "Payments" section above: no
  gateway, deposit + admin approval + auto commission deduction.
- **Sentry** SDKs are wired into all four apps but need a real DSN (see `SENTRY_DSN` /
  `VITE_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN`) before errors actually get reported.

## Launch checklist

### Technical (software you now have, plus what's left)
- [x] Real phone/OTP auth for riders and drivers
- [x] Real pickup/destination coordinates end-to-end (map-picked, reverse-geocoded)
- [x] Push notifications for drivers (new requests + ride assigned)
- [x] Rider push notifications (chat messages, trip started/completed)
- [x] Geo-filtered driver matching (drivers only query nearby geohash cells, not the whole city)
- [x] Rider app: English/Lao/Chinese language support (driver app + admin dashboard still English-only)
- [x] Driver app + admin dashboard: English/Lao/Chinese language support too
- [x] Ratings (rider ↔ driver, post-trip) and trip history (rider app + driver earnings view)
- [x] In-app rider ↔ driver chat (push notifications both directions)
- [x] Admin analytics/reports page (revenue, ride counts, active drivers, 7-day chart)
- [x] Payments = manual driver-wallet deposits (admin-approved) + auto commission deduction
- [x] Driver wallet: commission auto-deduction, minimum-balance gate to go online, manual
      bank-QR top-up with admin approval (see "Driver wallet" section below)
- [x] Self-hosted map stack (tiles, routing, geocoding) replacing Google Maps entirely —
      see "Self-hosted maps" section below
- [x] Road-distance fare estimates (self-hosted OSRM, haversine fallback)
- [x] Crash reporting — Sentry wired into all four apps with a live DSN:
      backend `SENTRY_DSN` (VPS `.env`), dashboard `VITE_SENTRY_DSN`
      (admin-dashboard/.env.production), apps `EXPO_PUBLIC_SENTRY_DSN`
      (rider-app/.env, driver-app/.env, inlined at build time). Native-app
      source maps still need `SENTRY_ORG` / `SENTRY_PROJECT` /
      `SENTRY_AUTH_TOKEN` at build time for readable stack traces.
- [x] Load-tested the deployed callables — `backend/scripts/load-test.ts` against
      api.gofair.getvgo.com: 20 workers × 15s → 403 requests, 100% success, 26.9 req/s,
      p95 ≈ 1.4s (every fare call exercises OSRM routing)
- [ ] App Store / Play Store listings, screenshots, privacy policy page, support email

### Business & legal (not something I can do for you)
- [ ] Register the business entity in your jurisdiction
- [ ] Confirm ride-hailing / transport-operator licensing requirements for Laos (or wherever you launch)
- [ ] Driver vetting: ID checks, driving license validation, vehicle insurance requirements
- [ ] Passenger insurance / liability coverage
- [ ] Terms of Use and Privacy Policy reviewed by a lawyer, not just copied from a template
- [ ] Payment processor / cash-handling compliance if you add digital payments
- [ ] Apple Developer account ($99/yr) and Google Play Developer account ($25 one-time)

## Rebranding

Change `brand.name` and `colors.primary` in each app's `theme.ts` (rider-app, driver-app), and the
CSS variables at the top of `admin-dashboard/src/index.css`. Update app icons/splash screens in
each app's `app.json` before building for the stores.
