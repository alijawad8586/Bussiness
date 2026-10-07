import { FieldValue } from 'firebase-admin/firestore';
import { AI_PROVIDERS, assertSafeBaseUrl, AiError, pickModel } from './aiClient.js';
import { classifyWaError } from './waErrors.js';
import { db, loadSecrets, loadServer, mainRef, phoneIndexRef, requireWhatsApp, secretsRef, serverRef, type Deps } from './repo.js';
import { AppError, type ContactDoc } from './types.js';
import { normalizePhone } from './phone.js';
import { Timestamp } from 'firebase-admin/firestore';
import { col } from './repo.js';

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
  const sub = await subscribeWebhook(uid, deps);
  return { displayNumber: check.displayNumber, verifiedName: check.verifiedName, webhookSubscribed: sub.ok, subscribeError: sub.error };
}

/** Asks WhatsApp to deliver this account's replies and delivery receipts to our webhook. Safe to repeat. */
export async function subscribeWebhook(uid: string, deps: Deps): Promise<{ ok: boolean; error: string | null }> {
  const w = await requireWhatsApp(uid);
  if (!deps.wa.subscribeApp) return { ok: false, error: 'Not supported' };
  const r = await deps.wa.subscribeApp({ wabaId: w.wabaId, token: w.token });
  const error = r.ok ? null : classifyWaError(r.error).kind === 'auth'
    ? 'The access token is missing the whatsapp_business_management permission.'
    : r.error.message;
  await serverRef(uid).set({ whatsapp: { webhookSubscribed: r.ok, subscribeError: error } }, { merge: true });
  return { ok: r.ok, error };
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

export async function saveAgent(uid: string, input: { provider: string; apiKey?: string; model?: string; baseUrl?: string; enabled: boolean }, deps: Deps) {
  const info = AI_PROVIDERS.find((p) => p.id === input.provider);
  if (!info) throw new AppError('invalid-argument', 'Choose an AI provider.');
  let baseUrl: string | undefined;
  if (info.id === 'custom') {
    try {
      baseUrl = assertSafeBaseUrl(str(input.baseUrl, 300));
    } catch (e) {
      throw new AppError('invalid-argument', e instanceof AiError ? e.message : 'Invalid API address.');
    }
  }
  const newKey = str(input.apiKey, 500);
  const secrets = await loadSecrets(uid);
  const key = newKey || secrets.aiKey;
  if (!key) throw new AppError('invalid-argument', 'Paste your API key.');

  // 1. Check the key. No model name needed: the provider just lists what this key can use.
  let available: string[] | null = null;
  if (deps.aiModels) {
    try {
      available = await deps.aiModels({ provider: info.id, baseUrl, key });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      if (/^(401|403)/.test(msg)) throw new AppError('invalid-argument', `${info.name} rejected this API key. Copy it again from the provider's website.`);
      if (info.id !== 'custom') throw new AppError('unavailable', `Could not check the key with ${info.name}: ${msg}`);
      // some "other" providers have no model list: then the model name must be typed
    }
  }

  // 2. Choose the model: the typed one if it works for this key, otherwise automatically.
  let model = str(input.model, 100);
  if (model && available && available.length && !available.includes(model)) {
    throw new AppError('invalid-argument', `The model "${model}" is not available for this key. Leave the model empty and one is chosen for you.`);
  }
  if (!model) {
    // nothing typed: keep the model already in use (for example when only the on/off switch changes), if it still works
    const server = await loadServer(uid);
    const kept = server.agent?.provider === info.id && (!baseUrl || server.agent.baseUrl === baseUrl) ? server.agent.model : '';
    if (kept && (!available || !available.length || available.includes(kept))) model = kept;
  }
  if (!model) model = (available && pickModel(info.id, available)) || (info.id === 'custom' ? '' : info.model);
  if (!model) throw new AppError('invalid-argument', 'This provider did not list any model. Type the model name.');

  if (newKey) await secretsRef(uid).set({ aiKey: newKey }, { merge: true });
  await serverRef(uid).set({ agent: { provider: info.id, model, ...(baseUrl ? { baseUrl } : {}), hasKey: true, lastError: null } }, { merge: true });
  await mainRef(uid).set({ agentEnabled: !!input.enabled }, { merge: true });
  return { ok: true, model, verified: !!available };
}

/** Sends one tiny request to the AI so the user knows the key works. If the saved model is gone, a working one is chosen. */
export async function testAgent(uid: string, deps: Deps) {
  const [server, secrets] = await Promise.all([loadServer(uid), loadSecrets(uid)]);
  if (!server.agent?.hasKey || !secrets.aiKey) throw new AppError('failed-precondition', 'Save an API key first.');
  const cfg = { provider: server.agent.provider, model: server.agent.model, baseUrl: server.agent.baseUrl, key: secrets.aiKey };
  const ask = (model: string) => deps.ai({ ...cfg, model }, 'You are a connection test.', [{ role: 'user', text: 'Reply with the single word OK.' }]);
  try {
    let reply: string;
    try {
      reply = await ask(cfg.model);
    } catch (e) {
      // the model was retired or is not open to this key: find another one and remember it
      if (!(e instanceof Error) || !/^(400|404)/.test(e.message) || !deps.aiModels) throw e;
      const picked = pickModel(cfg.provider, await deps.aiModels(cfg));
      if (!picked || picked === cfg.model) throw e;
      reply = await ask(picked);
      await serverRef(uid).set({ agent: { model: picked } }, { merge: true });
    }
    return { ok: true, reply: reply.slice(0, 100) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    throw new AppError('failed-precondition', /^(401|403)/.test(msg) ? 'The AI rejected this API key.' : `The AI request failed: ${msg}`);
  }
}

/**
 * Starts a chat with a number typed by hand: country code + number (+ optional name).
 * Creates the contact when it is new. Nothing is sent yet. WhatsApp itself decides whether the number
 * exists: if it does not, the first message comes back as "Not on WhatsApp".
 */
export async function startChat(uid: string, input: { countryCode: string; phone: string; name?: string }, deps: Deps) {
  const cc = digits(input.countryCode, 4);
  const national = digits(input.phone, 15).replace(/^0+/, '');
  if (!cc) throw new AppError('invalid-argument', 'Choose the country code.');
  if (!national) throw new AppError('invalid-argument', 'Enter the phone number.');
  const p = normalizePhone(`+${cc}${national}`);
  if (!p.ok) throw new AppError('invalid-argument', 'This is not a valid phone number. Check the country code and the number.');
  const name = str(input.name, 80);
  const ref = col(uid, 'contacts').doc(p.digits);
  const now = Timestamp.fromDate(deps.now());
  const snap = await ref.get();
  if (snap.exists) {
    if (name && !snap.data()!.name) await ref.update({ name, updatedAt: now });
    return { contactId: p.digits, created: false };
  }
  const doc: ContactDoc = {
    phone: p.digits, name, doctor: '', fields: {}, sheetId: null, rowNumber: null, updatedAt: now,
    whatsapp: 'unknown', optOut: false, needsHuman: false, unread: 0,
    lastMessageText: '', lastMessageAt: null, lastInboundAt: null, lastStatus: null,
    agentWindowStart: null, agentCount: 0, createdAt: now,
  };
  await ref.set(doc);
  return { contactId: p.digits, created: true };
}
