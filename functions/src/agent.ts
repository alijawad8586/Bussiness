import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AiError } from './aiClient.js';
import { cleanReply, detectIntent, EMERGENCY_REPLY, START_REPLY, STOP_REPLY, systemPrompt } from './agentSafety.js';
import { createAndSend, RetryLater } from './messaging.js';
import { col, db, loadMain, loadSecrets, loadServer, serverRef, type Deps } from './repo.js';
import type { ContactDoc, MessageDoc } from './types.js';

const MAX_REPLIES_PER_HOUR = 8;

export type AgentOutcome = 'replied' | 'disabled' | 'skipped' | 'handoff' | 'opted_out' | 'rate_limited' | 'ai_failed';

/**
 * Answers one incoming patient message when Agent mode is on.
 * Safe by design: it only ever answers a message the patient just sent, never starts a chat,
 * stops on STOP, hands emergencies to staff, and is capped per patient per hour.
 */
export async function agentReply(uid: string, inboundId: string, deps: Deps, opts: { lastAttempt: boolean }): Promise<AgentOutcome> {
  const inRef = col(uid, 'messages').doc(inboundId);
  const inSnap = await inRef.get();
  if (!inSnap.exists) return 'skipped';
  const inbound = inSnap.data() as MessageDoc;
  if (inbound.direction !== 'in' || inbound.kind !== 'text' || !inbound.text.trim()) return 'skipped';

  const [main, server, secrets] = await Promise.all([loadMain(uid), loadServer(uid), loadSecrets(uid)]);
  if (!main.agentEnabled || !server.agent?.hasKey || !secrets.aiKey) return 'disabled';

  const cRef = col(uid, 'contacts').doc(inbound.contactId);
  const contact = (await cRef.get()).data() as ContactDoc | undefined;
  if (!contact) return 'skipped';
  const handled = await db().runTransaction(async (t) => {
    const s = await t.get(inRef);
    if (s.data()?.agentHandled) return true;
    t.update(inRef, { agentHandled: true });
    return false;
  });
  if (handled) return 'skipped'; // a retry of a message we already answered

  // STOP / START were already saved on the contact by the webhook. Here we only confirm.
  const intent = detectIntent(inbound.text);
  if (intent === 'stop') {
    await createAndSend(uid, contact, { kind: 'text', by: 'agent', text: STOP_REPLY }, deps);
    return 'opted_out';
  }
  if (intent === 'start') {
    await createAndSend(uid, contact, { kind: 'text', by: 'agent', text: START_REPLY }, deps);
    return 'replied';
  }
  if (contact.optOut) return 'opted_out';
  if (intent === 'emergency') {
    await cRef.update({ needsHuman: true });
    await createAndSend(uid, contact, { kind: 'text', by: 'agent', text: EMERGENCY_REPLY }, deps);
    return 'handoff';
  }
  if (contact.needsHuman) return 'handoff'; // staff already took over this chat

  // Cap automatic replies per patient (protects against loops and cost)
  const now = deps.now();
  const allowed = await db().runTransaction(async (t) => {
    const c = (await t.get(cRef)).data() as ContactDoc;
    const fresh = !c.agentWindowStart || now.getTime() - c.agentWindowStart.toMillis() > 3600_000;
    const count = fresh ? 0 : c.agentCount;
    if (count >= MAX_REPLIES_PER_HOUR) return false;
    t.update(cRef, fresh ? { agentWindowStart: Timestamp.fromDate(now), agentCount: 1 } : { agentCount: FieldValue.increment(1) });
    return true;
  });
  if (!allowed) return 'rate_limited';

  // Last 10 messages of this chat, oldest first
  const recent = (await col(uid, 'messages').where('contactId', '==', contact.phone).orderBy('createdAt', 'desc').limit(10).get()).docs
    .map((d) => d.data() as MessageDoc)
    .filter((m) => m.status !== 'failed' && m.status !== 'not_on_whatsapp')
    .reverse();
  const history = recent.map((m) => ({ role: m.direction === 'in' ? ('user' as const) : ('assistant' as const), text: m.text }));
  if (!history.length || history[history.length - 1].role !== 'user') history.push({ role: 'user', text: inbound.text });

  let reply: string;
  try {
    reply = cleanReply(await deps.ai({ provider: server.agent.provider, model: server.agent.model, baseUrl: server.agent.baseUrl, key: secrets.aiKey }, systemPrompt(contact), history));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI request failed';
    const transient = e instanceof AiError && e.transient;
    await serverRef(uid).set({ agent: { lastError: msg } }, { merge: true });
    if (transient && !opts.lastAttempt) {
      await inRef.update({ agentHandled: false });
      await cRef.update({ agentCount: FieldValue.increment(-1) });
      throw new RetryLater(msg); // the task queue tries again
    }
    await inRef.update({ agentError: msg });
    return 'ai_failed'; // the patient's message stays unread for staff
  }

  await serverRef(uid).set({ agent: { lastError: null } }, { merge: true });
  await createAndSend(uid, contact, { kind: 'text', by: 'agent', text: reply }, deps);
  return 'replied';
}
