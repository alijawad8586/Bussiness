// WhatsApp (Meta) webhook that runs on Vercel. Use this as the Callback URL:
//   https://<your-vercel-domain>/api/whatsapp
//
// What it does today:
//   GET  : Meta's one-time check. Answers with Meta's challenge when the verify token matches.
//   POST : acknowledges events with 200 so Meta keeps the webhook enabled.
// It does NOT store messages. Replies and delivery receipts are saved only by the Firebase backend
// (functions/src/webhook.ts). When that backend is deployed, change the Callback URL in Meta to
// https://us-central1-new-app-8f5f3.cloudfunctions.net/whatsappWebhook
const crypto = require('node:crypto');

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = (req, res) => {
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
    // Log only that something arrived, never message content (patient privacy).
    console.log('whatsapp webhook event received');
    return send(200, 'ok');
  }

  res.setHeader('Allow', 'GET, POST');
  return send(405, 'Method not allowed');
};
