// Every call the app makes: POST /api/rpc  { fn, data }  with the Firebase ID token in the Authorization header.
// If something cannot even load, the answer says so (instead of an empty "500").
let handleRpc, isConfigured, ensureAdmin, makeDeps, originOf, readBody, json, fail, authUid, loadError;
try {
  ({ handleRpc } = require('./_core/rpc.js'));
  ({ isConfigured } = require('./_core/admin.js'));
  ({ ensureAdmin, makeDeps, originOf, readBody, json, fail, authUid } = require('./_lib.js'));
} catch (e) {
  loadError = e;
}
const hint = (e) => `${(e && (e.code || e.name)) || 'Error'}: ${String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 200)}`;

// Open https://<site>/api/rpc in the browser to see whether the server can reach the database.
async function health() {
  const out = { ok: true, configured: isConfigured(), adminOk: false, firestoreOk: false, time: new Date().toISOString() };
  if (!out.configured) return out;
  try {
    ensureAdmin();
    out.adminOk = true;
    await require('firebase-admin/firestore').getFirestore().collection('_health').limit(1).get();
    out.firestoreOk = true;
  } catch (e) {
    out.error = `${(e && (e.code || e.name)) || 'Error'}: ${String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 160)}`;
  }
  return out;
}

module.exports = async (req, res) => {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: { code: 'internal', message: 'Server could not start.', detail: hint(loadError) } }));
  }
  if (req.method === 'GET') return json(res, 200, await health());
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: { code: 'invalid-argument', message: 'Use POST.' } });
  }
  try {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const fn = String(body.fn || '');
    if (fn === 'health') return json(res, 200, await health());
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
