import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

// Real project values, filled in from your google-services.json /
// GoogleService-Info.plist (project "lao-taxi"). One thing I could NOT fill
// in from those files: `appId` and a browser-scoped `apiKey` are issued
// separately for a *Web* app registration, which wasn't among the files you
// gave me (those were Android/iOS only). Steps to finish this:
//   Firebase Console → Project Settings → Your apps → Add app → Web (</>)
//   → copy the `apiKey` and `appId` it gives you into the two fields below.
// Everything else here is already correct and doesn't need touching.
const firebaseConfig = {
  apiKey: 'REPLACE_ME_WITH_WEB_API_KEY',
  authDomain: 'lao-taxi.firebaseapp.com',
  projectId: 'lao-taxi',
  storageBucket: 'lao-taxi.firebasestorage.app',
  messagingSenderId: '775819116015',
  appId: 'REPLACE_ME_WITH_WEB_APP_ID',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
