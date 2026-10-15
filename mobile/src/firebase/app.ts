// Firebase bootstrap. Config comes from EXPO_PUBLIC_FIREBASE_* (see mobile/.env.example).
// Set EXPO_PUBLIC_FIREBASE_EMULATOR=1 to talk to the local emulators instead of the cloud.
import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'proxyproof-demo.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'proxyproof-demo',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:0:web:demo',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const useEmulator = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR === '1';
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST
  || (Platform.OS === 'web' && typeof location !== 'undefined' ? location.hostname : 'localhost');

export const app = getApps().length ? getApp() : initializeApp(cfg);

let _auth: Auth;
if (Platform.OS === 'web') {
  _auth = getAuth(app);
} else {
  // Persist the session on device. `getReactNativePersistence` lives in the RN entry of firebase/auth.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getReactNativePersistence } = require('firebase/auth');
  _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}
export const auth = _auth;

export const db: Firestore = initializeFirestore(app, {
  // RN's networking stack is happier with long polling than with WebChannel streaming.
  experimentalAutoDetectLongPolling: true,
});

if (useEmulator) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

export const firebaseInfo = {
  projectId: cfg.projectId,
  emulator: useEmulator ? `${emulatorHost}:8080` : null,
  configured: !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY || useEmulator,
};
