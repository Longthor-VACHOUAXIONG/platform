import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

// Firebase configuration for GoFair Admin Dashboard
// Production-ready configuration for lao-taxi project
// Web app registration completed

const firebaseConfig = {
  apiKey: 'AIzaSyBLuQPhn6g-DUMeKWuai2HysLRCCb5OzX0',
  authDomain: 'lao-taxi.firebaseapp.com',
  projectId: 'lao-taxi',
  storageBucket: 'lao-taxi.firebasestorage.app',
  messagingSenderId: '775819116015',
  appId: '1:775819116015:web:7d9fdc5e143aa10558ca1a',
  measurementId: 'G-46GTNSJ2SP'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
