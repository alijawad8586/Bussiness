import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { AppError } from './types.js';

/** Thrown when the server has no Firebase credentials yet. */
export const NOT_CONFIGURED = 'BACKEND_NOT_CONFIGURED';

function readServiceAccount(): { project_id: string; client_email: string; private_key: string } | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
  if (!raw) return null;
  // accepts the JSON file as is, or the same JSON encoded as base64
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  let sa: any;
  try {
    sa = JSON.parse(text);
  } catch {
    throw new AppError('failed-precondition', 'FIREBASE_SERVICE_ACCOUNT in Vercel is not valid JSON. Paste the whole downloaded .json file text, from { to }.');
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new AppError('failed-precondition', 'FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key. Use the key file from Firebase > Service accounts.');
  }
  sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
  return sa;
}

export const isConfigured = () => !!process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || !!process.env.FIRESTORE_EMULATOR_HOST;

/** Starts firebase-admin once. Uses the service account from FIREBASE_SERVICE_ACCOUNT (or the local emulators). */
export function ensureAdmin() {
  if (getApps().length) return;
  const sa = readServiceAccount();
  if (sa) {
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'new-app-8f5f3' });
  } else {
    throw new AppError('unavailable', NOT_CONFIGURED);
  }
}

/** Secret used to sign worker requests. Comes from the service account, so no extra setting is needed. */
export function workerSecret(): string {
  return readServiceAccount()?.private_key ?? 'local-emulator-secret';
}
