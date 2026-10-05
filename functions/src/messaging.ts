import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { classifyWaError } from './waErrors.js';
import { col, db, loadMain, requireWhatsApp, safeKey, serverRef, timeBucket, type Deps } from './repo.js';
import { AppError, type Bucket, type ContactDoc, type MessageDoc, type MsgStatus, type TemplateRef } from './types.js';

export const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;
const WINDOW_MS = 24 * 3600_000;

/** Thrown by `performSend` when WhatsApp had a temporary problem. The task queue retries later. */
export class RetryLater extends Error {}

export const bucketOf = (s: MsgStatus): Bucket => (s === 'delivered' || s === 'read' ? 'delivered' : s === 'not_on_whatsapp' ? 'notWhatsapp' : s);
const rank: Record<MsgStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 9, not_on_whatsapp: 9 };

export function canMove(from: MsgStatus, to: MsgStatus) {
  if (rank[from] === 9) return false; // failed / not_on_whatsapp are final
  if (rank[to] === 9) return from === 'queued' || from === 'sent';
  return rank[to] > rank[from];
}

export const renderBody = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');

/* ------------------------------------------------------------------ */
/* Status changes (the only place counters are touched)                 */
/* ------------------------------------------------------------------ */

export async function applyTransition(
  uid: string,
  msgRef: DocumentReference,
  to: MsgStatus,
  extra: Partial<MessageDoc> & Record<string, unknown>,
  deps: Deps,
): Promise<boolean> {
  return db().runTransaction(async (t) => {
    const snap = await t.get(msgRef);
    if (!snap.exists) return false;
    const d = snap.data() as MessageDoc;
    if (!canMove(d.status, to)) return false;

    const now = Timestamp.fromDate(deps.now());
    const from = bucketOf(d.status);
    const next = bucketOf(to);
    const cRef = d.campaignId ? col(uid, 'campaigns').doc(d.campaignId) : null;
    const cSnap = cRef ? await t.get(cRef) : null;

    const bucket = d.bucket ?? timeBucket(deps.now());
    t.update(msgRef, { ...extra, status: to, bucket, updatedAt: now });

    if (cRef && cSnap?.exists) {
      const up: Record<string, unknown> = {};
      if (from !== next) {
        up[`stats.${from}`] = FieldValue.increment(-1);
        up[`stats.${next}`] = FieldValue.increment(1);
        if (next === 'delivered' || next === 'failed' || next === 'notWhatsapp') {
          up[`timeline.${bucket}.${next}`] = FieldValue.increment(1);
          up[`byDoctor.${safeKey(d.doctor)}.${next}`] = FieldValue.increment(1);
        }
      }
      const err = (extra.error ?? null) as MessageDoc['error'];
      if ((to === 'failed' || to === 'not_on_whatsapp') && err) {
        up[`failReasons.c${err.code}.count`] = FieldValue.increment(1);
        up[`failReasons.c${err.code}.label`] = err.hint || err.message;
      }
      const queuedAfter = (cSnap.data()!.stats?.queued ?? 0) + (from === 'queued' ? -1 : 0) + (next === 'queued' ? 1 : 0);
      if (queuedAfter <= 0 && cSnap.data()!.status !== 'completed' && cSnap.data()!.status !== 'paused') {
        up.status = 'completed';
        up.finishedAt = now;
      }
      if (Object.keys(up).length) t.update(cRef, up);
    }

    const cRefContact = col(uid, 'contacts').doc(d.contactId);
    const cu: Record<string, unknown> = { lastStatus: to, updatedAt: now };
    if (d.status === 'queued') {
      cu.lastMessageText = d.text;
      cu.lastMessageAt = now;
    }
    if (to === 'not_on_whatsapp') cu.whatsapp = 'invalid';
    if (to === 'sent' || to === 'delivered' || to === 'read') cu.whatsapp = 'ok';
    t.update(cRefContact, cu);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Sending one message (campaign, manual, or AI agent)                  */
/* ------------------------------------------------------------------ */

export type SendOutcome = 'sent' | 'failed' | 'not_on_whatsapp' | 'skipped' | 'paused' | 'campaign_stopped';

/**
 * Sends one queued message and records exactly what happened.
 * `retryable` is true when a task queue will call us again (campaign messages).
 */
export async function performSend(uid: string, messageId: string, opts: { retryable: boolean }, deps: Deps): Promise<SendOutcome> {
  const ref = col(uid, 'messages').doc(messageId);
  const nowMs = deps.now().getTime();

  // 1. Claim the message so two workers cannot send it twice.
  const claimed = await db().runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists) return null;
    const d = s.data() as MessageDoc;
    if (d.status !== 'queued') return null;
    if (d.lockedUntil && d.lockedUntil.toMillis() > nowMs) return null;
    if (d.campaignId) {
      const cRef = col(uid, 'campaigns').doc(d.campaignId);
      const c = await t.get(cRef);
      if (c.data()?.status === 'paused') return 'paused' as const;
      if (c.data()?.status === 'queued') t.update(cRef, { status: 'running', startedAt: Timestamp.fromMillis(nowMs) });
    }
    t.update(ref, { lockedUntil: Timestamp.fromMillis(nowMs + LEASE_MS), attempts: FieldValue.increment(1) });
    return { ...d, attempts: d.attempts + 1 };
  });
  if (claimed === null) return 'skipped';
  if (claimed === 'paused') return 'paused';
  const d = claimed;

  // 2. Credentials
  let wa;
  try {
    wa = await requireWhatsApp(uid);
  } catch (e) {
    await stopCampaign(uid, d, e instanceof Error ? e.message : 'WhatsApp is not connected.', ref);
    return 'campaign_stopped';
  }

  // 3. Send
  const res =
    d.kind === 'template'
      ? await deps.wa.sendTemplate({ phoneNumberId: wa.phoneNumberId, token: wa.token, to: d.phone, template: { name: d.template!, language: d.templateLanguage! }, params: d.params })
      : await deps.wa.sendText({ phoneNumberId: wa.phoneNumberId, token: wa.token, to: d.phone, text: d.text });

  if (res.ok) {
    await applyTransition(uid, ref, 'sent', { waMessageId: res.waMessageId, error: null, lockedUntil: null }, deps);
    return 'sent';
  }

  // 4. Something went wrong: decide what it means
  const c = classifyWaError(res.error);
  const err = { code: c.code, message: c.message, hint: c.hint };

  if (c.kind === 'template' || c.kind === 'auth') {
    // Not this patient's fault. Stop the campaign and keep the message queued so "Resume" can send it.
    if (c.kind === 'auth') {
      await serverRef(uid).set({ whatsapp: { connected: false, error: c.hint } }, { merge: true });
    }
    if (!d.campaignId) {
      // A single message (inbox or agent): nothing to pause, just record the failure.
      await applyTransition(uid, ref, 'failed', { error: err, lockedUntil: null }, deps);
      return 'failed';
    }
    await stopCampaign(uid, d, c.hint, ref);
    return 'campaign_stopped';
  }
  if (c.kind === 'transient' && opts.retryable && d.attempts < MAX_ATTEMPTS) {
    await ref.update({ lockedUntil: null, error: err });
    throw new RetryLater(c.message);
  }
  const to: MsgStatus = c.kind === 'not_on_whatsapp' ? 'not_on_whatsapp' : 'failed';
  const finalErr = c.kind === 'transient' ? { ...err, hint: 'WhatsApp kept failing after several tries. You can retry it from the report.' } : err;
  await applyTransition(uid, ref, to, { error: finalErr, lockedUntil: null }, deps);
  return to;
}

async function stopCampaign(uid: string, d: MessageDoc, reason: string, msgRef: DocumentReference) {
  await msgRef.update({ lockedUntil: null });
  if (d.campaignId) await col(uid, 'campaigns').doc(d.campaignId).update({ status: 'paused', error: reason });
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                            */
/* ------------------------------------------------------------------ */

async function enqueueAll(uid: string, ids: string[], speed: number, deps: Deps) {
  const gap = 60 / Math.max(1, speed);
  for (let i = 0; i < ids.length; i += 50) {
    await Promise.all(ids.slice(i, i + 50).map((id, k) => deps.enqueue.send(uid, id, Math.floor((i + k) * gap))));
  }
}

export async function createCampaign(uid: string, input: { sheetId: string }, deps: Deps) {
  const main = await loadMain(uid);
  const tpl = main.template;
  if (!tpl) throw new AppError('failed-precondition', 'Choose an approved template in Settings first.');
  await requireWhatsApp(uid);

  const sheet = await col(uid, 'sheets').doc(input.sheetId).get();
  if (!sheet.exists) throw new AppError('not-found', 'Upload a sheet first.');
  const columns: string[] = sheet.data()!.columns ?? [];
  if (main.varCols.length !== tpl.variableCount || main.varCols.some((c) => !columns.includes(c))) {
    throw new AppError('failed-precondition', 'Choose a sheet column for every template variable, then save settings.');
  }

  const contacts = (await col(uid, 'contacts').where('sheetId', '==', input.sheetId).get()).docs;
  const eligible = contacts.filter((c) => !(c.data() as ContactDoc).optOut);
  if (!eligible.length) throw new AppError('failed-precondition', 'There are no contacts to message in this sheet.');

  const now = Timestamp.fromDate(deps.now());
  const cRef = col(uid, 'campaigns').doc();
  const byDoctor: Record<string, { total: number; delivered: number; failed: number; notWhatsapp: number }> = {};
  const msgs = eligible.map((doc) => {
    const c = doc.data() as ContactDoc;
    const params = main.varCols.map((k) => c.fields[k] ?? '');
    const k = safeKey(c.doctor);
    byDoctor[k] ??= { total: 0, delivered: 0, failed: 0, notWhatsapp: 0 };
    byDoctor[k].total++;
    return { id: `${cRef.id}_${c.phone}`, data: newMessage(c, { kind: 'template', by: 'campaign', campaignId: cRef.id, template: tpl, params, now }) };
  });

  await cRef.set({
    template: { name: tpl.name, language: tpl.language, body: tpl.body },
    sheetId: input.sheetId, sheetName: sheet.data()!.fileName ?? '',
    status: 'queued', total: msgs.length, optOutSkipped: contacts.length - eligible.length, speed: main.speed,
    stats: { queued: msgs.length, sent: 0, delivered: 0, failed: 0, notWhatsapp: 0 },
    byDoctor, failReasons: {}, timeline: {}, error: null, createdAt: now, startedAt: null, finishedAt: null,
  });
  for (let i = 0; i < msgs.length; i += 400) {
    const b = db().batch();
    msgs.slice(i, i + 400).forEach((m) => b.set(col(uid, 'messages').doc(m.id), m.data));
    await b.commit();
  }
  try {
    await enqueueAll(uid, msgs.map((m) => m.id), main.speed, deps);
    await deps.kick?.(uid, cRef.id);
  } catch (e) {
    await cRef.update({ status: 'paused', error: 'Could not start the sending queue. Press Resume to try again.' });
    throw new AppError('unavailable', 'Messages are saved but the sending queue could not start. Open the report and press Resume.');
  }
  return { campaignId: cRef.id, total: msgs.length, skippedOptOut: contacts.length - eligible.length };
}

export function newMessage(
  c: ContactDoc,
  o: { kind: 'template' | 'text'; by: MessageDoc['by']; campaignId: string | null; template?: TemplateRef | null; params?: string[]; text?: string; now: Timestamp },
): MessageDoc {
  const params = o.params ?? [];
  return {
    contactId: c.phone, phone: c.phone, patient: c.name, patientLower: c.name.toLowerCase(), doctor: c.doctor,
    direction: 'out', kind: o.kind, by: o.by, campaignId: o.campaignId,
    template: o.template?.name ?? null, templateLanguage: o.template?.language ?? null, params,
    text: o.kind === 'template' && o.template ? renderBody(o.template.body, params) : (o.text ?? ''),
    status: 'queued', waMessageId: null, error: null, attempts: 0, lockedUntil: null, outAt: o.now, bucket: null,
    createdAt: o.now, updatedAt: o.now,
  };
}

/** Rebuilds a campaign's counters from its messages. Used after retries and as a safety net. */
export async function recountCampaign(uid: string, campaignId: string) {
  const cRef = col(uid, 'campaigns').doc(campaignId);
  const msgs = (await col(uid, 'messages').where('campaignId', '==', campaignId).get()).docs.map((d) => d.data() as MessageDoc);
  const stats: Record<Bucket, number> = { queued: 0, sent: 0, delivered: 0, failed: 0, notWhatsapp: 0 };
  const byDoctor: Record<string, Record<string, number>> = {};
  const failReasons: Record<string, { count: number; label: string }> = {};
  const timeline: Record<string, Record<string, number>> = {};
  for (const m of msgs) {
    const b = bucketOf(m.status);
    stats[b]++;
    const k = safeKey(m.doctor);
    byDoctor[k] ??= { total: 0, delivered: 0, failed: 0, notWhatsapp: 0 };
    byDoctor[k].total++;
    if (b === 'delivered' || b === 'failed' || b === 'notWhatsapp') {
      byDoctor[k][b]++;
      if (m.bucket) {
        timeline[m.bucket] ??= {};
        timeline[m.bucket][b] = (timeline[m.bucket][b] ?? 0) + 1;
      }
    }
    if (m.error && (b === 'failed' || b === 'notWhatsapp')) {
      const key = `c${m.error.code}`;
      failReasons[key] ??= { count: 0, label: m.error.hint || m.error.message };
      failReasons[key].count++;
    }
  }
  const update: Record<string, unknown> = { stats, byDoctor, failReasons, timeline, total: msgs.length };
  if (stats.queued === 0) update.status = 'completed';
  await cRef.update(update);
  return stats;
}

export async function campaignAction(uid: string, input: { campaignId: string; action: 'pause' | 'resume' | 'retryFailed' }, deps: Deps) {
  const cRef = col(uid, 'campaigns').doc(input.campaignId);
  const c = await cRef.get();
  if (!c.exists) throw new AppError('not-found', 'Report not found.');
  const speed = (c.data()!.speed as number) || 20;

  if (input.action === 'pause') {
    await cRef.update({ status: 'paused' });
    return { count: 0 };
  }
  if (input.action === 'retryFailed') {
    const failed = (await col(uid, 'messages').where('campaignId', '==', input.campaignId).where('status', '==', 'failed').get()).docs;
    for (let i = 0; i < failed.length; i += 400) {
      const b = db().batch();
      failed.slice(i, i + 400).forEach((d) => b.update(d.ref, { status: 'queued', error: null, attempts: 0, lockedUntil: null, notBefore: null, bucket: null, updatedAt: Timestamp.fromDate(deps.now()) }));
      await b.commit();
    }
    await recountCampaign(uid, input.campaignId);
  }
  await requireWhatsApp(uid);
  const queued = await col(uid, 'messages').where('campaignId', '==', input.campaignId).where('status', '==', 'queued').get();
  await cRef.update({ status: queued.size ? 'running' : 'completed', error: null });
  await enqueueAll(uid, queued.docs.map((d) => d.id), speed, deps);
  if (queued.size) await deps.kick?.(uid, input.campaignId);
  return { count: queued.size };
}

/* ------------------------------------------------------------------ */
/* One-off messages from the inbox                                      */
/* ------------------------------------------------------------------ */

async function loadContact(uid: string, contactId: string) {
  const s = await col(uid, 'contacts').doc(contactId).get();
  if (!s.exists) throw new AppError('not-found', 'Contact not found.');
  return s.data() as ContactDoc;
}

export async function sendManual(uid: string, input: { contactId: string; text: string }, deps: Deps) {
  const text = String(input.text ?? '').trim();
  if (!text) throw new AppError('invalid-argument', 'Type a message first.');
  if (text.length > 4000) throw new AppError('invalid-argument', 'The message is too long.');
  const c = await loadContact(uid, input.contactId);
  if (c.optOut) throw new AppError('failed-precondition', 'This patient asked not to receive messages.');
  await requireWhatsApp(uid);
  // WhatsApp only allows free text within 24 hours after the patient's last message.
  if (!c.lastInboundAt || deps.now().getTime() - c.lastInboundAt.toMillis() > WINDOW_MS) {
    throw new AppError('failed-precondition', 'The patient has not written in the last 24 hours. WhatsApp only allows an approved template now. Use "Template".');
  }
  const id = await createAndSend(uid, c, { kind: 'text', by: 'manual', text }, deps);
  await col(uid, 'contacts').doc(c.phone).update({ needsHuman: false });
  return id;
}

export async function sendTemplateToContact(uid: string, input: { contactId: string }, deps: Deps) {
  const main = await loadMain(uid);
  if (!main.template) throw new AppError('failed-precondition', 'Choose an approved template in Settings first.');
  const c = await loadContact(uid, input.contactId);
  if (c.optOut) throw new AppError('failed-precondition', 'This patient asked not to receive messages.');
  await requireWhatsApp(uid);
  const params = main.varCols.map((k) => c.fields[k] ?? '');
  return createAndSend(uid, c, { kind: 'template', by: 'manual', template: main.template, params }, deps);
}

export async function createAndSend(
  uid: string,
  c: ContactDoc,
  o: { kind: 'template' | 'text'; by: MessageDoc['by']; text?: string; template?: TemplateRef; params?: string[] },
  deps: Deps,
) {
  const ref = col(uid, 'messages').doc();
  await ref.set(newMessage(c, { ...o, campaignId: null, now: Timestamp.fromDate(deps.now()) }));
  const outcome = await performSend(uid, ref.id, { retryable: false }, deps);
  const saved = (await ref.get()).data() as MessageDoc;
  return { messageId: ref.id, outcome, status: saved.status, error: saved.error };
}
