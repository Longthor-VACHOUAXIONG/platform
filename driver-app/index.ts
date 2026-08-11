import { registerRootComponent } from 'expo';
import { setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import * as Sentry from '@sentry/react-native';
import { installGlobalErrorHandler } from './src/components/ErrorOverlay';
import { messaging } from './src/api/firebaseConfig';

import App from './App';

// Show uncaught JS errors on-screen (with a stack) instead of silently closing
// in release builds — invaluable when testing without adb access.
installGlobalErrorHandler();

// Error tracking — enabled only when EXPO_PUBLIC_SENTRY_DSN is set in the
// build env (see Sentry docs for the Expo config plugin + sourcemap upload).
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

// Must be registered outside the React tree, before the app mounts, so FCM
// can deliver data-only messages while the app is fully backgrounded/killed.
setBackgroundMessageHandler(messaging, async (remoteMessage) => {
  // Data payload only reaches here; the OS shows the `notification` block
  // itself when backgrounded, so there's usually nothing to render here —
  // just a place to sync local state (e.g. cache the incoming ride) if needed.
  console.log('Background push received:', remoteMessage.data);
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
