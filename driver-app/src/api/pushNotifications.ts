import { requestPermission, getToken, AuthorizationStatus, onMessage, onTokenRefresh } from '@react-native-firebase/messaging';
import { httpsCallable } from '@react-native-firebase/functions';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import { messaging, functions } from './firebaseConfig';

const registerPushTokenFn = httpsCallable<{ pushToken: string }, { ok: boolean }>(
  functions,
  'registerPushToken'
);

/**
 * Requests notification permission, gets an FCM token, and saves it to the
 * driver's Firestore doc via the registerPushToken Cloud Function. Call this
 * once after sign-in (e.g. when HomeScreen mounts).
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
  onTokenRefresh(messaging, async (newToken) => {
    await registerPushTokenFn({ pushToken: newToken });
  });
}

/**
 * Foreground listener — when the app is open, FCM doesn't show a system
 * notification automatically, so surface it yourself. Swap the Alert for a
 * proper in-app toast/banner component.
 */
export function listenForForegroundPush(onNewRequest: (rideId: string) => void) {
  return onMessage(messaging, async (remoteMessage) => {
    const { type, rideId } = remoteMessage.data ?? {};
    if (type === 'new_ride_request' && typeof rideId === 'string') {
      onNewRequest(rideId);
    } else if (type === 'ride_assigned') {
      Alert.alert(remoteMessage.notification?.title ?? 'Ride update', remoteMessage.notification?.body);
    }
  });
}
