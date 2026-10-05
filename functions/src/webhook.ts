import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { detectIntent } from './agentSafety.js';
import { applyTransition } from './messaging.js';
import { classifyWaError } from './waErrors.js';
import { col, loadMain, phoneIndexRef, serverRef, type Deps } from './repo.js';
import type { ContactDoc, MessageDoc, MsgStatus } from './types.js';

/** Meta signs every webhook call with the app secret. Returns true when the signature is right. */
export function verifySignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string) {
  if (!appSecret) return true; // signature check is optional until a secret is configured
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const STATUS_MAP: Record<string, MsgStatus | undefined> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };

function textOf(m: any): { kind: 'text'; text: string } {
  switch (m.type) {
    case 'text': return { kind: 'text', text: String(m.text?.body ?? '') };
    case 'button': return { kind: 'text', text: String(m.button?.text ?? '') };
    case 'interactive': return { kind: 'text', text: String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') };
    default: return { kind: 'text', text: `[${m.type ?? 'unknown'} message]` };
  }
}

export interface WebhookResult {
  inbound: number;
  statuses: number;
  /** items that hit a database problem. The caller answers 500 so Meta sends them again (all writes are idempotent). */
  failures: number;
}

export async function handleWebhook(payload: any, deps: Deps): Promise<WebhookResult> {
  const result: WebhookResult = { inbound: 0, statuses: 0, failures: 0 };
  const touched = new Map<string, { inbound: number; statuses: number }>();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') continue;
      const v = change.value ?? {};
      const phoneNumberId = String(v.metadata?.phone_number_id ?? '');
      if (!phoneNumberId) continue;
      const owner = await phoneIndexRef(phoneNumberId).get();
      const uid = owner.data()?.uid as string | undefined;
      if (!uid) {
        console.warn('webhook for a phone number id that is not connected to any account');
        continue; // a number we do not manage
      }
      const seen = touched.get(uid) ?? { inbound: 0, statuses: 0 };
      touched.set(uid, seen);

      for (const st of v.statuses ?? []) {
        try {
          if (await onStatus(uid, st, deps)) { result.statuses++; seen.statuses++; }
        } catch (e) {
          console.error('webhook status failed', e);
          result.failures++;
        }
      }
      for (const m of v.messages ?? []) {
        try {
          if (await onInbound(uid, m, v.contacts ?? [], deps)) { result.inbound++; seen.inbound++; }
        } catch (e) {
          console.error('webhook message failed', e);
          result.failures++;
        }
      }
    }
  }
  // Remember that WhatsApp reached us, so the Settings screen can show whether receiving works.
  for (const [uid, n] of touched) {
    await serverRef(uid).set({ webhook: { lastAt: Timestamp.fromDate(deps.now()), inbound: n.inbound, statuses: n.statuses } }, { merge: true }).catch(() => {});
  }
  return result;
}

async function onStatus(uid: string, st: any, deps: Deps): Promise<boolean> {
  const to = STATUS_MAP[String(st.status)];
  if (!to || !st.id) return false;
  const found = await col(uid, 'messages').where('waMessageId', '==', String(st.id)).limit(1).get();
  if (found.empty) return false;
  let extra: Record<string, unknown> = {};
  let target: MsgStatus = to;
  if (to === 'failed') {
    const e = st.errors?.[0] ?? {};
    const c = classifyWaError({ code: Number(e.code ?? 0), message: String(e.message ?? e.title ?? 'Delivery failed'), httpStatus: 200 });
    target = c.kind === 'not_on_whatsapp' ? 'not_on_whatsapp' : 'failed';
    extra = { error: { code: c.code, message: c.message, hint: c.hint } };
  }
  return applyTransition(uid, found.docs[0].ref, target, extra, deps);
}

async function onInbound(uid: string, m: any, profiles: any[], deps: Deps): Promise<boolean> {
  const waId = String(m.id ?? '');
  // Meta may leave `from` out and only list the person in `contacts`, so fall back to that
  const phone = String(m.from || profiles.find((p) => p?.wa_id)?.wa_id || '').replace(/\D/g, '');
  if (!waId || !phone) return false;
  const body = textOf(m);
  const now = Timestamp.fromDate(deps.now());
  const msgRef = col(uid, 'messages').doc(`in_${waId}`);
  const cRef = col(uid, 'contacts').doc(phone);
  const profileName = String(profiles.find((p) => String(p.wa_id) === phone)?.profile?.name ?? '');

  const isNew = await col(uid, 'messages').firestore.runTransaction(async (t) => {
    const [mSnap, cSnap] = await Promise.all([t.get(msgRef), t.get(cRef)]);
    if (mSnap.exists) return false; // WhatsApp delivers some messages twice
    const c = cSnap.data() as ContactDoc | undefined;
    const name = c?.name || profileName;
    const msg: MessageDoc = {
      contactId: phone, phone, patient: name, patientLower: name.toLowerCase(), doctor: c?.doctor ?? '',
      direction: 'in', kind: 'text', by: 'patient', campaignId: null, template: null, templateLanguage: null, params: [],
      text: body.text, status: 'delivered', waMessageId: waId, error: null, attempts: 0, lockedUntil: null, outAt: null, bucket: null,
      createdAt: Timestamp.fromMillis(Number(m.timestamp) * 1000 || now.toMillis()), updatedAt: now,
    };
    t.set(msgRef, msg);
    // STOP / START are always honoured, even when Agent mode is off.
    const intent = detectIntent(body.text);
    const patch: Record<string, unknown> = { unread: FieldValue.increment(1), lastMessageText: body.text, lastMessageAt: now, lastInboundAt: now, updatedAt: now };
    if (intent === 'stop') patch.optOut = true;
    if (intent === 'start') patch.optOut = false;
    if (c) t.update(cRef, patch);
    else {
      const fresh: ContactDoc = {
        phone, name: profileName, doctor: '', fields: {}, sheetId: null, rowNumber: null, whatsapp: 'ok', optOut: false, needsHuman: false,
        unread: 0, lastMessageText: '', lastMessageAt: null, lastInboundAt: null, lastStatus: null, agentWindowStart: null, agentCount: 0, createdAt: now, updatedAt: now,
      };
      t.set(cRef, { ...fresh, ...patch });
    }
    return true;
  });
  if (!isNew) return false;
  if ((await loadMain(uid)).agentEnabled) await deps.enqueue.agent(uid, msgRef.id);
  return true;
}
