// This config is public by design. Access is protected by Firestore rules and sign-in, not by hiding it.
export const firebaseConfig = {
  apiKey: 'AIzaSyD2lscjhXXSD-wQj-eodgis84Q4X89Wb2g',
  authDomain: 'new-app-8f5f3.firebaseapp.com',
  projectId: 'new-app-8f5f3',
  storageBucket: 'new-app-8f5f3.firebasestorage.app',
  messagingSenderId: '178736204875',
  appId: '1:178736204875:web:ba852e942395bb9ed391ce',
};

export const FUNCTIONS_REGION = 'us-central1';
export const WEBHOOK_URL = `https://${FUNCTIONS_REGION}-${firebaseConfig.projectId}.cloudfunctions.net/whatsappWebhook`;
