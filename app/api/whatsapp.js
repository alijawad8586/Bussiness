// WhatsApp (Meta) webhook. Use this as the Callback URL:  https://<your-vercel-domain>/api/whatsapp
//   GET  : Meta's one-time check. Answers with Meta's challenge when the verify token matches.
//   POST : saves delivery receipts and patient replies, and starts the AI agent when it is switched on.
// Settings (Vercel environment variables): WA_VERIFY_TOKEN, optional WA_APP_SECRET (checks Meta's signature),
// and FIREBASE_SERVICE_ACCOUNT (needed to save events).
const crypto = require('node:crypto');
const { handleWebhook, verifySignature } = require('./_core/webhook.js');
const { makeDeps, originOf, readBody, ensureAdmin } = require('./_lib.js');

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  const send = (code, text) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  };

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const token = process.env.WA_VERIFY_TOKEN || '';
    if (token && q.get('hub.mode') === 'subscribe' && same(q.get('hub.verify_token') ?? '', token)) {
      return send(200, q.get('hub.challenge') ?? '');
    }
    return send(403, 'Forbidden');
  }

  if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      if (!verifySignature(raw, req.headers['x-hub-signature-256'], process.env.WA_APP_SECRET || '')) return send(401, 'Bad signature');
      ensureAdmin();
      const { deps, runAgentJobs } = makeDeps(originOf(req));
      const r = await handleWebhook(JSON.parse(raw.toString('utf8') || '{}'), deps);
      runAgentJobs();
      // 500 makes Meta send the event again. Every write is idempotent, so repeats are safe.
      return send(r.failures ? 500 : 200, r.failures ? 'retry' : 'ok');
    } catch (e) {
      console.error('webhook failed', e && e.message);
      return send(500, 'retry');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(405, 'Method not allowed');
};
