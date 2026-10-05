// iOS / Android build: same as firebase.ts, but keeps the login on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// @ts-ignore getReactNativePersistence is only exported in the react-native build of firebase/auth
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { firebaseConfig, API_BASE, WEBHOOK_URL } from './firebaseConfig';

export { firebaseConfig, API_BASE, WEBHOOK_URL };
export const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
