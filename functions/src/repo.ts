import { getFirestore, type CollectionReference, type DocumentReference } from 'firebase-admin/firestore';
import { AppError, type MainSettings, type Secrets, type ServerSettings } from './types.js';
import type { WaApi } from './whatsapp.js';
import type { generate } from './aiClient.js';

/** Everything the logic needs from the outside world. Tests pass fakes. */
export interface Deps {
  wa: WaApi;
  ai: typeof generate;
  enqueue: {
    send(uid: string, messageId: string, delaySeconds: number): Promise<void>;
    agent(uid: string, messageId: string): Promise<void>;
  };
  now(): Date;
  /** Called when messages were queued for a campaign. Hosts without a task queue use it to start a worker. */
  kick?(uid: string, campaignId: string): Promise<void>;
}

export const db = () => getFirestore();
export const userRef = (uid: string) => db().collection('users').doc(uid);
export const col = (uid: string, name: 'contacts' | 'messages' | 'campaigns' | 'sheets'): CollectionReference => userRef(uid).collection(name);
export const mainRef = (uid: string): DocumentReference => userRef(uid).collection('settings').doc('main');
export const serverRef = (uid: string): DocumentReference => userRef(uid).collection('settings').doc('server');
export const secretsRef = (uid: string): DocumentReference => userRef(uid).collection('private').doc('secrets');
export const phoneIndexRef = (phoneNumberId: string): DocumentReference => db().collection('phoneNumbers').doc(phoneNumberId);

export const DEFAULT_MAIN: MainSettings = {
  mapping: { phoneCol: '', patientCol: '', doctorCol: '' },
  template: null,
  varCols: [],
  autoSend: true,
  speed: 20,
  agentEnabled: false,
};

export async function loadMain(uid: string): Promise<MainSettings> {
  const s = await mainRef(uid).get();
  return { ...DEFAULT_MAIN, ...(s.data() as Partial<MainSettings> | undefined), mapping: { ...DEFAULT_MAIN.mapping, ...(s.data()?.mapping ?? {}) } };
}

export async function loadServer(uid: string): Promise<ServerSettings> {
  return ((await serverRef(uid).get()).data() as ServerSettings | undefined) ?? {};
}

export async function loadSecrets(uid: string): Promise<Secrets> {
  return ((await secretsRef(uid).get()).data() as Secrets | undefined) ?? {};
}

/** WhatsApp credentials, or an error the user can understand. */
export async function requireWhatsApp(uid: string) {
  const [server, secrets] = await Promise.all([loadServer(uid), loadSecrets(uid)]);
  const w = server.whatsapp;
  if (!w?.connected || !secrets.whatsappToken) {
    throw new AppError('failed-precondition', 'WhatsApp is not connected. Connect it first.');
  }
  return { phoneNumberId: w.phoneNumberId, wabaId: w.wabaId, token: secrets.whatsappToken };
}

/** Firestore field-path safe version of a name (no dots, slashes or brackets). */
export const safeKey = (s: string) => (s || 'Unassigned').replace(/[.\/~*\[\]`]/g, '').replace(/\s+/g, ' ').trim() || 'Unassigned';

/** 10-minute time bucket, used for the "sending performance" chart. */
export const timeBucket = (d: Date) => `b${Math.floor(d.getTime() / 600_000)}`;
