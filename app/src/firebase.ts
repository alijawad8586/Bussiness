// Web build. See firebase.native.ts for iOS / Android.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';

import { firebaseConfig, API_BASE, WEBHOOK_URL } from './firebaseConfig';

export { firebaseConfig, API_BASE, WEBHOOK_URL };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

// `EXPO_PUBLIC_EMULATOR=1 npm run web` talks to the local Firebase emulators instead of the real project.
if (process.env.EXPO_PUBLIC_EMULATOR === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
