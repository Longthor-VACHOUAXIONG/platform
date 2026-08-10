// Uses React Native Firebase's native modules (not the firebase JS SDK).
// This is required for real phone-number OTP auth in React Native — the
// JS SDK's phone auth needs a browser reCAPTCHA widget that doesn't exist
// on native, and Expo's old `expo-firebase-recaptcha` shim was removed in
// SDK 48. Native modules also mean Firestore/Functions calls automatically
// carry the signed-in user's auth token, since it's all one native SDK
// session (mixing this with the JS SDK would give you two disconnected
// auth states).
//
// SETUP REQUIRED before this compiles into a real app:
//   1. Firebase Console → Project Settings → Add app → iOS and Android
//   2. Download GoogleService-Info.plist → place at rider-app/GoogleService-Info.plist
//   3. Download google-services.json → place at rider-app/google-services.json
//   4. This app can no longer run in Expo Go (native modules aren't in it).
//      Build a dev client instead: `npx expo prebuild` then `eas build --profile development`
//      (or `npx expo run:ios` / `run:android` if you have Xcode/Android Studio locally).
//
// @react-native-firebase v26+ uses the same "modular" function style as the
// firebase JS SDK (getAuth/getFirestore + free functions), so this file's
// exports are drop-in-familiar if you've used the web SDK before.

import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getMessaging } from '@react-native-firebase/messaging';
import { FUNCTIONS_DOMAIN } from '../config/api';

const app = getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
// Custom-domain host: business logic runs on the gofair VPS, not on Google
// Cloud Functions (see ../config/api.ts).
export const functions = getFunctions(app, FUNCTIONS_DOMAIN);
export const messaging = getMessaging(app);
