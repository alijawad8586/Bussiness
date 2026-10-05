// Every call the app makes: POST /api/rpc  { fn, data }  with the Firebase ID token in the Authorization header.
const { handleRpc } = require('./_core/rpc.js');
const { isConfigured } = require('./_core/admin.js');
const { makeDeps, originOf, readBody, json, fail, authUid } = require('./_lib.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: { code: 'invalid-argument', message: 'Use POST.' } });
  }
  try {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const fn = String(body.fn || '');
    if (fn === 'health') return json(res, 200, { ok: true, configured: isConfigured(), time: new Date().toISOString() });
    const uid = await authUid(req);
    const { deps, runAgentJobs } = makeDeps(originOf(req));
    const result = await handleRpc(fn, uid, body.data ?? {}, deps);
    runAgentJobs();
    return json(res, 200, { result });
  } catch (e) {
    if (e instanceof SyntaxError) return fail(res, new (require('./_core/types.js').AppError)('invalid-argument', 'Bad request.'));
    return fail(res, e);
  }
};
