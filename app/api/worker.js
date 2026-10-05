// Sends the queued messages of one campaign, at the chosen speed. Called by /api/rpc (signed), never by the browser directly.
// It answers at once and keeps working in the background. If time runs out, it starts the next run itself.
const { waitUntil } = require('@vercel/functions');
const { runWorker } = require('./_core/worker.js');
const { makeDeps, originOf, verifyWorkerToken, readBody, json, fail, ensureAdmin } = require('./_lib.js');

const BUDGET_MS = 45000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: { code: 'invalid-argument', message: 'Use POST.' } });
  }
  try {
    const b = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    ensureAdmin();
    if (!verifyWorkerToken(b)) return json(res, 403, { error: { code: 'permission-denied', message: 'Not allowed.' } });
    const origin = originOf(req);
    const { deps, runAgentJobs } = makeDeps(origin);
    json(res, 202, { accepted: true });
    waitUntil((async () => {
      try {
        const r = await runWorker(String(b.uid), String(b.campaignId), deps, { budgetMs: BUDGET_MS });
        // continue in a fresh run when time ran out; if nothing could be sent (all waiting), the open report restarts it later
        if (r.remaining > 0 && r.processed > 0 && (r.status === 'running' || r.status === 'queued')) await deps.kick(String(b.uid), String(b.campaignId));
      } catch (e) {
        console.error('worker failed', e);
      }
      runAgentJobs();
    })());
  } catch (e) {
    return fail(res, e);
  }
};
