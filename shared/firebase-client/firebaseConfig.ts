import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
// Importing this registers React Native's AsyncStorage as the auth
// persistence layer automatically (firebase JS SDK >= 10.7 auto-detects RN
// and uses it under the hood — no need to call getReactNativePersistence).
import '@react-native-async-storage/async-storage';

// TODO: replace with your Firebase project's config
// (Firebase Console → Project Settings → General → Your apps → SDK setup)
const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
