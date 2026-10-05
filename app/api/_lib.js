// Shared helpers for the API routes. The business logic lives in _core (built from functions/src).
const crypto = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { waitUntil } = require('@vercel/functions');
const { ensureAdmin, workerSecret, NOT_CONFIGURED } = require('./_core/admin.js');
const { AppError } = require('./_core/types.js');
const { realWa } = require('./_core/whatsapp.js');
const { generate } = require('./_core/aiClient.js');
const { agentReply } = require('./_core/agent.js');
const { RetryLater } = require('./_core/messaging.js');

const STATUS = {
  'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'not-found': 404,
  'already-exists': 409, 'failed-precondition': 412, 'resource-exhausted': 429, unavailable: 503, internal: 500,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function originOf(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') || String(host).startsWith('127.') ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}

const sign = (uid, campaignId, ts) => crypto.createHmac('sha256', workerSecret()).update(`${uid}:${campaignId}:${ts}`).digest('hex');

function verifyWorkerToken(b) {
  if (!b || !b.uid || !b.campaignId || !b.ts || !b.sig) return false;
  if (Math.abs(Date.now() - Number(b.ts)) > 10 * 60 * 1000) return false;
  const want = Buffer.from(sign(String(b.uid), String(b.campaignId), String(b.ts)));
  const got = Buffer.from(String(b.sig));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** Starts a background worker (a separate request to /api/worker) that sends this campaign's messages. */
async function kickWorker(origin, uid, campaignId) {
  const ts = String(Date.now());
  try {
    const r = await fetch(`${origin}/api/worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, campaignId, ts, sig: sign(uid, campaignId, ts) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('worker kick refused', r.status);
  } catch (e) {
    // the app also kicks every ~20s while a report is open, so this is not fatal
    console.error('worker kick failed', e && e.message);
  }
}

/** deps for the shared logic. Agent replies are collected and run in the background after the response. */
function makeDeps(origin) {
  const agentJobs = [];
  const deps = {
    wa: realWa,
    ai: generate,
    now: () => new Date(),
    enqueue: {
      send: async () => {}, // sending is done by /api/worker, not by one task per message
      agent: async (uid, messageId) => { agentJobs.push({ uid, messageId }); },
    },
    kick: (uid, campaignId) => kickWorker(origin, uid, campaignId),
  };
  const runAgentJobs = () => {
    if (!agentJobs.length) return;
    waitUntil((async () => {
      for (const j of agentJobs) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await agentReply(j.uid, j.messageId, deps, { lastAttempt: attempt === 2 });
            break;
          } catch (e) {
            if (!(e instanceof RetryLater) && attempt === 2) console.error('agent reply failed', e);
            await sleep(3000 * (attempt + 1));
          }
        }
      }
    })());
  };
  return { deps, runAgentJobs };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4.5 * 1024 * 1024) { reject(new AppError('invalid-argument', 'Request too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res, e) {
  if (e instanceof AppError) {
    const code = e.message === NOT_CONFIGURED ? 503 : STATUS[e.code] || 500;
    return json(res, code, { error: { code: e.code, message: e.message } });
  }
  console.error('api failed', e);
  return json(res, 500, { error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } });
}

/** Returns the signed-in user's id from the "Authorization: Bearer <Firebase ID token>" header. */
async function authUid(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) throw new AppError('unauthenticated', 'Please sign in.');
  ensureAdmin();
  try {
    return (await getAuth().verifyIdToken(h.slice(7))).uid;
  } catch {
    throw new AppError('unauthenticated', 'Your session expired. Please sign in again.');
  }
}

module.exports = { ensureAdmin, makeDeps, originOf, verifyWorkerToken, readBody, json, fail, authUid, NOT_CONFIGURED };
