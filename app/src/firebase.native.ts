// iOS / Android build: same as firebase.ts, but keeps the login on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// @ts-ignore getReactNativePersistence is only exported in the react-native build of firebase/auth
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { firebaseConfig, FUNCTIONS_REGION, WEBHOOK_URL } from './firebaseConfig';

export { firebaseConfig, FUNCTIONS_REGION, WEBHOOK_URL };
export const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const fns = getFunctions(app, FUNCTIONS_REGION);
