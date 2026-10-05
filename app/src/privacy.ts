import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { POLICY_VERSION } from './legal';

/**
 * Saves that a user accepted the current policy version:
 *  - privacy/{uid}                      the latest acceptance
 *  - privacy/{uid}/accepted/{version}   a permanent record for each version
 */
export async function recordConsent(uid: string, email: string) {
  const batch = writeBatch(db);
  const data = { version: POLICY_VERSION, acceptedAt: serverTimestamp(), email };
  batch.set(doc(db, `privacy/${uid}`), data);
  batch.set(doc(db, `privacy/${uid}/accepted/${POLICY_VERSION}`), data);
  await batch.commit();
}
