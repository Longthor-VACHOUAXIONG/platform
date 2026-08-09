import { registerRootComponent } from 'expo';
import { setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { messaging } from './src/api/firebaseConfig';

import App from './App';

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
