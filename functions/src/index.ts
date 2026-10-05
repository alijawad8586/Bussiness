import { initializeApp } from 'firebase-admin/app';
import { getFunctions } from 'firebase-admin/functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, onRequest, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { defineString } from 'firebase-functions/params';
import { generate } from './aiClient.js';
import { agentReply } from './agent.js';
import { campaignAction, createCampaign, MAX_ATTEMPTS, performSend, RetryLater, sendManual, sendTemplateToContact } from './messaging.js';
import { loadMain, type Deps } from './repo.js';
import { importSheet } from './sheetImport.js';
import { connectWhatsApp, listTemplates, saveAgent, testAgent } from './setup.js';
import { AppError } from './types.js';
import { handleWebhook, verifySignature } from './webhook.js';
import { realWa } from './whatsapp.js';

initializeApp();
const REGION = 'us-central1';
setGlobalOptions({ region: REGION, maxInstances: 10 });

// Set these in functions/.env (see .env.example)
const verifyToken = defineString('WA_VERIFY_TOKEN');
const appSecret = defineString('WA_APP_SECRET', { default: '' });

const deps: Deps = {
  wa: realWa,
  ai: generate,
  now: () => new Date(),
  enqueue: {
    send: (uid, messageId, delaySeconds) =>
      getFunctions().taskQueue('sendMessageTask').enqueue({ uid, messageId }, { scheduleDelaySeconds: delaySeconds, dispatchDeadlineSeconds: 120 }),
    agent: (uid, messageId) => getFunctions().taskQueue('agentReplyTask').enqueue({ uid, messageId }, { dispatchDeadlineSeconds: 120 }),
  },
};

/** Every callable: must be signed in, and errors become messages the app can show. */
function api<T, R>(fn: (uid: string, data: T) => Promise<R>, heavy = false) {
  // Importing thousands of rows and queueing their messages can take a while.
  return onCall<T>({ cors: true, ...(heavy ? { timeoutSeconds: 300, memory: '512MiB' as const } : {}) }, async (req: CallableRequest<T>) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Please sign in.');
    try {
      return await fn(req.auth.uid, (req.data ?? {}) as T);
    } catch (e) {
      if (e instanceof AppError) throw new HttpsError(e.code, e.message);
      console.error('callable failed', e);
      throw new HttpsError('internal', 'Something went wrong on our side. Please try again.');
    }
  });
}

export const health = onCall({ cors: true }, () => ({ ok: true, region: REGION, time: new Date().toISOString() }));
export const connectWhatsAppFn = api<any, unknown>((uid, d) => connectWhatsApp(uid, d, deps));
export const listTemplatesFn = api<any, unknown>((uid) => listTemplates(uid, deps));
export const saveAgentFn = api<any, unknown>((uid, d) => saveAgent(uid, d));
export const testAgentFn = api<any, unknown>((uid) => testAgent(uid, deps));
export const campaignActionFn = api<any, unknown>((uid, d) => campaignAction(uid, d, deps), true);
export const sendManualFn = api<any, unknown>((uid, d) => sendManual(uid, d, deps));
export const sendTemplateFn = api<any, unknown>((uid, d) => sendTemplateToContact(uid, d, deps));

/** Upload: create contacts from the sheet, then (if Auto-send is on) start sending. */
export const importSheetFn = api<any, unknown>(async (uid, d) => {
  const summary = await importSheet(uid, d, deps);
  let campaign: { campaignId: string; total: number } | null = null;
  let sendError: string | null = null;
  if ((await loadMain(uid)).autoSend && summary.created + summary.updated > 0) {
    try {
      campaign = await createCampaign(uid, { sheetId: summary.sheetId }, deps);
    } catch (e) {
      // Contacts are saved. Tell the user why sending did not start.
      sendError = e instanceof AppError ? e.message : 'Sending could not start.';
    }
  }
  return { ...summary, campaign, sendError };
}, true);

export const startCampaignFn = api<any, unknown>(async (uid, d) => {
  if (!d?.sheetId) throw new AppError('invalid-argument', 'Upload a sheet first.');
  return createCampaign(uid, { sheetId: String(d.sheetId) }, deps);
}, true);

/* ---------- queues ---------- */

export const sendMessageTask = onTaskDispatched<{ uid: string; messageId: string }>(
  { retryConfig: { maxAttempts: MAX_ATTEMPTS + 1, minBackoffSeconds: 30, maxBackoffSeconds: 900, maxDoublings: 4 }, rateLimits: { maxConcurrentDispatches: 5 }, memory: '256MiB' },
  async (req) => {
    try {
      await performSend(req.data.uid, req.data.messageId, { retryable: true }, deps);
    } catch (e) {
      if (e instanceof RetryLater) throw e; // queue retries with back-off
      console.error('sendMessageTask failed', req.data, e);
      throw e;
    }
  },
);

export const agentReplyTask = onTaskDispatched<{ uid: string; messageId: string }>(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 20, maxBackoffSeconds: 300 }, rateLimits: { maxConcurrentDispatches: 5 }, memory: '256MiB', timeoutSeconds: 120 },
  async (req) => {
    await agentReply(req.data.uid, req.data.messageId, deps, { lastAttempt: (req.retryCount ?? 0) >= 2 });
  },
);

/* ---------- WhatsApp webhook (Meta calls this) ---------- */

export const whatsappWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method === 'GET') {
    // One-time verification when you add the webhook in the Meta dashboard
    const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken.value();
    res.status(ok ? 200 : 403).send(ok ? String(req.query['hub.challenge'] ?? '') : 'Forbidden');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), appSecret.value())) {
    res.status(401).send('Bad signature');
    return;
  }
  try {
    const r = await handleWebhook(req.body, deps);
    // 500 makes Meta resend. Every write is idempotent, so repeats are safe.
    res.status(r.failures ? 500 : 200).send(r.failures ? 'retry' : 'ok');
  } catch (e) {
    console.error('webhook crashed', e);
    res.status(500).send('retry');
  }
});
