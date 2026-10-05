// Web build. See firebase.native.ts for iOS / Android.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

import { firebaseConfig, FUNCTIONS_REGION, WEBHOOK_URL } from './firebaseConfig';

export { firebaseConfig, FUNCTIONS_REGION, WEBHOOK_URL };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const fns = getFunctions(app, FUNCTIONS_REGION);

// `EXPO_PUBLIC_EMULATOR=1 npm run web` talks to the local Firebase emulators instead of the real project.
if (process.env.EXPO_PUBLIC_EMULATOR === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
}
