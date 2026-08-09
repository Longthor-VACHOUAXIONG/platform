# Rider App (Phase 1 scaffold)

A React Native (Expo + TypeScript) rider app implementing a **fare-negotiation ride-hailing flow**:
splash → onboarding/auth → map home → set destination → choose ride type & set your fare →
search for driver offers (with raise-fare prompts) → choose a driver → trip in progress.

This is an original implementation built for your own brand — swap the name, colors, and logo
in `src/theme/theme.ts` before shipping.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) or press `i` / `a` for a simulator/emulator.

### Maps setup (required before it will show a real map)

This uses `react-native-maps`. You'll need:
- **Android**: a Google Maps API key in `app.json` under `android.config.googleMaps.apiKey`
- **iOS**: works out of the box in Expo Go with Apple Maps; for Google Maps on iOS add a key too

Until you add a key, the map may render blank in some environments — the UI/flow still works.

## What's implemented (Phase 1 — Rider app)

| Screen | File | Matches |
|---|---|---|
| Splash | `src/screens/SplashScreen.tsx` | logo → tagline intro |
| Onboarding / Auth | `src/screens/OnboardingScreen.tsx` | sign-in options |
| Home / Map | `src/screens/HomeScreen.tsx` | pickup pin, search bar, ride categories |
| Set destination | `src/screens/SetDestinationScreen.tsx` | drag-map-pin picker |
| Choose ride + fare | `src/screens/ChooseRideScreen.tsx` | ride type list, fare stepper, options modal |
| Searching for offers | `src/screens/SearchingOffersScreen.tsx` | countdown, raise-fare prompts, cancel flow |
| Choose a driver | `src/screens/ChooseDriverScreen.tsx` | driver offer cards, accept/decline |
| Trip in progress | `src/screens/TripInProgressScreen.tsx` | placeholder, expand in Phase 2 |

All data is currently **mocked** (`src/data/mock.ts`) — no live backend yet. Swap these for real
API/Firestore calls once the backend is wired up.

## Roadmap (not yet built)

- **Phase 2 — Driver app**: separate Expo app (or a mode-switch in the same app) where drivers see
  incoming ride requests on a map, submit competing fare offers, navigate to pickup/drop-off.
- **Phase 3 — Admin dashboard**: React web app (e.g. Next.js) for ops to see live rides, manage
  drivers/verification, set base pricing per zone, view reports.
- **Phase 4 — Backend**:
  - **Auth**: Firebase Auth (phone/Google) or your own OAuth server
  - **Realtime matching**: Firestore/Realtime DB listeners, or a WebSocket service, to broadcast
    ride requests to nearby drivers and stream fare offers back to the rider in real time
  - **Geo**: Google Maps Directions/Distance Matrix API for ETA + route, or Mapbox as a cheaper alt
  - **Payments**: cash-first (as shown here) is simplest to launch; add mobile money / card later
  - **Cloud Functions**: driver-rider matching radius logic, surge/zone pricing, ride state machine

## Rebranding checklist

- [ ] `src/theme/theme.ts` → `brand.name`, `colors.primary`
- [ ] App icon/splash → `assets/` + `app.json`
- [ ] `app.json` → `name`, `slug`, `bundleIdentifier` / `package`
