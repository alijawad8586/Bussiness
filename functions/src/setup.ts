import { FieldValue } from 'firebase-admin/firestore';
import { AI_PROVIDERS, assertSafeBaseUrl, AiError } from './aiClient.js';
import { classifyWaError } from './waErrors.js';
import { db, loadSecrets, loadServer, mainRef, phoneIndexRef, requireWhatsApp, secretsRef, serverRef, type Deps } from './repo.js';
import { AppError } from './types.js';

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
/** Meta IDs are plain numbers. Spaces, +, - and similar are ignored. */
const digits = (v: unknown, max = 40) => String(v ?? '').replace(/\D/g, '').slice(0, max);

export async function connectWhatsApp(uid: string, input: { productId: string; wabaId: string; phoneNumberId: string; token: string }, deps: Deps) {
  const productId = str(input.productId, 60).toUpperCase();
  const wabaId = digits(input.wabaId);
  const phoneNumberId = digits(input.phoneNumberId);
  const token = str(input.token, 1000);
  if (!productId) throw new AppError('invalid-argument', 'Enter your Product ID.');
  if (!/^\d{5,}$/.test(wabaId)) throw new AppError('invalid-argument', 'Enter the WhatsApp Business Account ID from Meta (numbers only).');
  if (!/^\d{5,}$/.test(phoneNumberId)) throw new AppError('invalid-argument', 'Enter the Phone Number ID from Meta (numbers only). It is not your phone number.');
  if (token.length < 20) throw new AppError('invalid-argument', 'The access token looks too short.');

  // Prove the credentials work before saving anything.
  const check = await deps.wa.verifyNumber({ phoneNumberId, token });
  if (!check.ok) {
    const c = classifyWaError(check.error);
    if (c.kind === 'auth') throw new AppError('invalid-argument', 'WhatsApp rejected this access token. Create a new token and try again.');
    if (check.error.code === 100) throw new AppError('invalid-argument', 'WhatsApp cannot find this Phone Number ID, or the token has no access to it.');
    throw new AppError('unavailable', `Could not reach WhatsApp: ${check.error.message}`);
  }

  await db().runTransaction(async (t) => {
    const idx = phoneIndexRef(phoneNumberId);
    const [idxSnap, srv] = await Promise.all([t.get(idx), t.get(serverRef(uid))]);
    if (idxSnap.exists && idxSnap.data()!.uid !== uid) {
      throw new AppError('permission-denied', 'This WhatsApp number is already connected to another account.');
    }
    const old = srv.data()?.whatsapp?.phoneNumberId as string | undefined;
    if (old && old !== phoneNumberId) t.delete(phoneIndexRef(old));
    t.set(idx, { uid, updatedAt: FieldValue.serverTimestamp() });
    t.set(secretsRef(uid), { whatsappToken: token }, { merge: true });
    t.set(serverRef(uid), {
      whatsapp: { connected: true, productId, wabaId, phoneNumberId, displayNumber: check.displayNumber, verifiedName: check.verifiedName, error: null },
    }, { merge: true });
  });
  return { displayNumber: check.displayNumber, verifiedName: check.verifiedName };
}

export async function listTemplates(uid: string, deps: Deps) {
  const w = await requireWhatsApp(uid);
  const r = await deps.wa.listTemplates({ wabaId: w.wabaId, token: w.token });
  if (!r.ok) {
    const c = classifyWaError(r.error);
    throw new AppError(c.kind === 'auth' ? 'failed-precondition' : 'unavailable', c.kind === 'auth' ? c.hint : `Could not load templates: ${r.error.message}`);
  }
  return { templates: r.templates };
}

export async function saveAgent(uid: string, input: { provider: string; apiKey?: string; model?: string; baseUrl?: string; enabled: boolean }) {
  const info = AI_PROVIDERS.find((p) => p.id === input.provider);
  if (!info) throw new AppError('invalid-argument', 'Choose an AI provider.');
  const model = str(input.model, 100) || info.model;
  let baseUrl: string | undefined;
  if (info.id === 'custom') {
    try {
      baseUrl = assertSafeBaseUrl(str(input.baseUrl, 300));
    } catch (e) {
      throw new AppError('invalid-argument', e instanceof AiError ? e.message : 'Invalid API address.');
    }
    if (!model) throw new AppError('invalid-argument', 'Enter the model name.');
  }
  const newKey = str(input.apiKey, 500);
  const secrets = await loadSecrets(uid);
  if (!newKey && !secrets.aiKey) throw new AppError('invalid-argument', 'Paste your API key.');
  if (newKey) await secretsRef(uid).set({ aiKey: newKey }, { merge: true });

  await serverRef(uid).set({ agent: { provider: info.id, model, ...(baseUrl ? { baseUrl } : {}), hasKey: true, lastError: null } }, { merge: true });
  await mainRef(uid).set({ agentEnabled: !!input.enabled }, { merge: true });
  return { ok: true };
}

/** Sends one tiny request to the AI so the user knows the key works. */
export async function testAgent(uid: string, deps: Deps) {
  const [server, secrets] = await Promise.all([loadServer(uid), loadSecrets(uid)]);
  if (!server.agent?.hasKey || !secrets.aiKey) throw new AppError('failed-precondition', 'Save an API key first.');
  try {
    const reply = await deps.ai(
      { provider: server.agent.provider, model: server.agent.model, baseUrl: server.agent.baseUrl, key: secrets.aiKey },
      'You are a connection test.',
      [{ role: 'user', text: 'Reply with the single word OK.' }],
    );
    return { ok: true, reply: reply.slice(0, 100) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    throw new AppError('failed-precondition', /^(401|403)/.test(msg) ? 'The AI rejected this API key.' : `The AI request failed: ${msg}`);
  }
}
