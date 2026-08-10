import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBLuQPhn6g-DUMeKWuai2HysLRCCb5OzX0',
  authDomain: 'lao-taxi.firebaseapp.com',
  projectId: 'lao-taxi',
  storageBucket: 'lao-taxi.firebasestorage.app',
  messagingSenderId: '775819116015',
  appId: '1:775819116015:web:7d9fdc5e143aa10558ca1a',
};

// Where the backend business-logic functions live. In development these ran
// as Firebase Cloud Functions; for the VPS deploy they run on the VPS behind
// Caddy (see infra/README.md). The Firebase web SDK accepts a full custom
// domain here in place of a region string.
const FUNCTIONS_DOMAIN = 'https://api.gofair.getvgo.com';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_DOMAIN);
export const storage = getStorage(app);
