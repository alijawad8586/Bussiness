import { initializeApp, getApps } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { Deps } from '../src/repo.js';
import { col, mainRef, phoneIndexRef, secretsRef, serverRef } from '../src/repo.js';
import type { SendResult, WaApi } from '../src/whatsapp.js';
import type { WaError } from '../src/waErrors.js';
import type { MainSettings, TemplateRef } from '../src/types.js';
import { AiError } from '../src/aiClient.js';

if (!getApps().length) initializeApp({ projectId: 'demo-test' });

export const TEMPLATE: TemplateRef = {
  name: 'appointment_reminder', language: 'en', variableCount: 2,
  body: 'Assalam o Alaikum {{1}}, your appointment with {{2}} is confirmed.',
};

export class FakeWa implements WaApi {
  calls: { type: 'template' | 'text'; to: string; params?: string[]; text?: string }[] = [];
  /** return an error for a given call, or undefined for success */
  fail: (to: string, n: number) => WaError | undefined = () => undefined;
  private n = 0;
  async sendTemplate(a: Parameters<WaApi['sendTemplate']>[0]): Promise<SendResult> {
    this.calls.push({ type: 'template', to: a.to, params: a.params });
    const e = this.fail(a.to, this.calls.length);
    return e ? { ok: false, error: e } : { ok: true, waMessageId: `wamid.${++this.n}.${a.to}` };
  }
  async sendText(a: Parameters<WaApi['sendText']>[0]): Promise<SendResult> {
    this.calls.push({ type: 'text', to: a.to, text: a.text });
    const e = this.fail(a.to, this.calls.length);
    return e ? { ok: false, error: e } : { ok: true, waMessageId: `wamid.t${++this.n}.${a.to}` };
  }
  subscribed: string[] = [];
  async subscribeApp(a: { wabaId: string; token: string }) { this.subscribed.push(a.wabaId); return { ok: true as const }; }
  async listTemplates() { return { ok: true as const, templates: [TEMPLATE] }; }
  async verifyNumber(a: { phoneNumberId: string; token: string }) {
    return a.token.startsWith('good')
      ? { ok: true as const, displayNumber: '+92 300 0000000', verifiedName: 'Test Clinic' }
      : { ok: false as const, error: { code: 190, message: 'bad token', httpStatus: 401 } };
  }
}

export interface Harness {
  uid: string;
  wa: FakeWa;
  deps: Deps;
  sent: { uid: string; messageId: string; delay: number }[];
  agentJobs: { uid: string; messageId: string }[];
  aiCalls: { system: string; history: { role: string; text: string }[] }[];
  aiResult: () => string | Error;
  clock: { t: number };
}

export function harness(): Harness {
  const h: Harness = {
    uid: `u_${randomUUID().slice(0, 8)}`,
    wa: new FakeWa(),
    sent: [], agentJobs: [], aiCalls: [], clock: { t: Date.parse('2026-10-05T09:00:00Z') },
    aiResult: () => 'Your appointment is confirmed.',
    deps: null as unknown as Deps,
  };
  h.deps = {
    wa: h.wa,
    now: () => new Date(h.clock.t),
    ai: async (_cfg, system, history) => {
      h.aiCalls.push({ system, history });
      const r = h.aiResult();
      if (r instanceof Error) throw r;
      return r;
    },
    enqueue: {
      send: async (uid, messageId, delay) => { h.sent.push({ uid, messageId, delay }); },
      agent: async (uid, messageId) => { h.agentJobs.push({ uid, messageId }); },
    },
  };
  return h;
}

/** A user who connected WhatsApp and picked a template. */
export async function seedUser(h: Harness, over: Partial<MainSettings> = {}) {
  const main: MainSettings = {
    mapping: { phoneCol: 'phone', patientCol: 'name', doctorCol: 'doctor' },
    template: TEMPLATE, varCols: ['name', 'doctor'], autoSend: true, speed: 60, agentEnabled: false, ...over,
  };
  await mainRef(h.uid).set(main);
  await serverRef(h.uid).set({ whatsapp: { connected: true, productId: 'P', wabaId: '111111', phoneNumberId: `pn_${h.uid}`, displayNumber: '+92', verifiedName: 'T', error: null } });
  await secretsRef(h.uid).set({ whatsappToken: 'good-token-for-tests-123' });
  await phoneIndexRef(`pn_${h.uid}`).set({ uid: h.uid });
}

export const SHEET = [
  ['phone', 'name', 'doctor', 'time'],
  ['0300-1234567', 'Ayesha Khan', 'Dr. Imran Qureshi', '4:30 PM'],
  ['+92 321 7788990', 'Muhammad Usman', 'Dr. Sara Ahmed', '5:00 PM'],
  ['923334561230', 'Fatima Noor', 'Dr. Imran Qureshi', '5:30 PM'],
];

export async function contact(h: Harness, phone: string) {
  return (await col(h.uid, 'contacts').doc(phone).get()).data()!;
}
export async function messagesOf(h: Harness, campaignId: string) {
  return (await col(h.uid, 'messages').where('campaignId', '==', campaignId).get()).docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
}
export async function campaign(h: Harness, id: string) {
  return (await col(h.uid, 'campaigns').doc(id).get()).data()!;
}
export const ts = (ms: number) => Timestamp.fromMillis(ms);
export const aiTransient = () => new AiError('429: slow down', true);
