// This config is public by design. Access is protected by Firestore rules and sign-in, not by hiding it.
export const firebaseConfig = {
  apiKey: 'AIzaSyD2lscjhXXSD-wQj-eodgis84Q4X89Wb2g',
  authDomain: 'new-app-8f5f3.firebaseapp.com',
  projectId: 'new-app-8f5f3',
  storageBucket: 'new-app-8f5f3.firebasestorage.app',
  messagingSenderId: '178736204875',
  appId: '1:178736204875:web:ba852e942395bb9ed391ce',
};

// The backend is the /api folder of the same Vercel site. The web app calls it on its own address;
// the phone apps need the full address (set EXPO_PUBLIC_API_BASE to use another one).
const web = typeof document !== 'undefined';
const DEFAULT_SITE = 'https://carereach-gamma.vercel.app';
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? (web ? '' : DEFAULT_SITE)).replace(/\/$/, '');
export const WEBHOOK_URL = `${API_BASE || (web ? window.location.origin : DEFAULT_SITE)}/api/whatsapp`;
