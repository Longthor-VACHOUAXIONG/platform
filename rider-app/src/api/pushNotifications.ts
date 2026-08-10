import { requestPermission, getToken, AuthorizationStatus, onMessage, onTokenRefresh } from '@react-native-firebase/messaging';
import { httpsCallable } from '@react-native-firebase/functions';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import { messaging, functions } from './firebaseConfig';

const registerPushTokenFn = httpsCallable<{ pushToken: string }, { ok: boolean }>(
  functions,
  'registerRiderPushToken'
);

// setUpPushNotifications() runs on every HomeScreen mount; guard the token
// refresh listener with a module flag so it isn't re-registered (and then
// firing duplicate registerPushToken calls on every token rotation).
let tokenRefreshRegistered = false;

/**
 * Requests notification permission, gets an FCM token, and saves it to the
 * rider's Firestore doc (`users/{uid}.pushToken`) via the
 * registerRiderPushToken Cloud Function. Call this once after sign-in (e.g.
 * when HomeScreen mounts).
 */
export async function setUpPushNotifications() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    // Android 13+ requires a runtime permission for notifications.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  const authStatus = await requestPermission(messaging);
  const enabled =
    authStatus === AuthorizationStatus.AUTHORIZED || authStatus === AuthorizationStatus.PROVISIONAL;
  if (!enabled) return;

  const token = await getToken(messaging);
  await registerPushTokenFn({ pushToken: token });

  // Keep the token fresh — FCM tokens can rotate.
  if (!tokenRefreshRegistered) {
    tokenRefreshRegistered = true;
    onTokenRefresh(messaging, async (newToken) => {
      await registerPushTokenFn({ pushToken: newToken });
    });
  }
}

/**
 * Foreground listener — when the app is open, FCM doesn't show a system
 * notification automatically, so surface it yourself. Swap the Alert for a
 * proper in-app toast/banner component.
 */
export function listenForForegroundPush() {
  return onMessage(messaging, async (remoteMessage) => {
    const { type } = remoteMessage.data ?? {};
    if (type === 'chat_message' || type === 'trip_started' || type === 'trip_completed') {
      Alert.alert(remoteMessage.notification?.title ?? 'Ride update', remoteMessage.notification?.body);
    }
  });
}
