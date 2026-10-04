'use strict';

/* ---------- tiny storage helpers (localStorage may be unavailable) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const $ = (id) => document.getElementById(id);

/* ---------- AI providers ---------- */
// kind: openai = OpenAI-style chat API, gemini = Google, anthropic = Claude
const BUILTIN = [
  { id: 'openai', name: 'ChatGPT (OpenAI)', kind: 'openai', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Gemini (Google)', kind: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
  { id: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  { id: 'groq', name: 'Groq', kind: 'openai', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
];

let user = null;           // {email, name}
let tab = 'login';
let sheet = null;          // {name, rows}
let history = [];          // chat history

const kKeys = () => 'bz_keys_' + user.email;       // {providerId: {key, model}}
const kCustom = () => 'bz_custom_' + user.email;   // [{id,name,kind,url,model}]
const kSheet = () => 'bz_sheet_' + user.email;
const providers = () => BUILTIN.concat(store.get(kCustom(), []));

/* ---------- auth ---------- */
async function hash(pw, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function setTab(t) {
  tab = t;
  $('tabLogin').classList.toggle('active', t === 'login');
  $('tabSignup').classList.toggle('active', t === 'signup');
  $('nameRow').classList.toggle('hidden', t === 'login');
  $('authSubmit').textContent = t === 'login' ? 'Login' : 'Create account';
  $('password').autocomplete = t === 'login' ? 'current-password' : 'new-password';
  $('authError').textContent = '';
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const pw = $('password').value;
  const users = store.get('bz_users', {});
  if (tab === 'signup') {
    if (users[email]) return ($('authError').textContent = 'Ye email pehle se registered hai. Login karo.');
    const salt = crypto.getRandomValues(new Uint32Array(2)).join('');
    users[email] = { name: $('name').value.trim() || email, salt, hash: await hash(pw, salt) };
    store.set('bz_users', users);
  } else {
    const u = users[email];
    if (!u || u.hash !== (await hash(pw, u.salt))) return ($('authError').textContent = 'Email ya password galat hai.');
  }
  login({ email, name: users[email].name });
}

function login(u) {
  user = u;
  store.set('bz_session', u);
  sheet = store.get(kSheet(), null);
  history = [];
  $('authPage').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('userLabel').textContent = u.name + ' · ' + u.email;
  $('gClient').value = store.get('bz_google_client', '');
  renderProviders();
  renderAgentSelect();
  renderSheet();
  renderChat();
  showPage('settings'); // after login: API Cloud page first
}

function logout() {
  store.del('bz_session');
  user = null;
  $('app').classList.add('hidden');
  $('authPage').classList.remove('hidden');
  $('authForm').reset();
  setTab('login');
}

/* ---------- Google sign-in ---------- */
function decodeJwt(t) {
  const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(p))));
}

function initGoogle() {
  const cid = store.get('bz_google_client', '');
  const ready = cid && window.google && google.accounts && google.accounts.id;
  $('googleFallback').classList.toggle('hidden', !!ready);
  if (!ready) return;
  google.accounts.id.initialize({
    client_id: cid,
    callback: (r) => {
      const p = decodeJwt(r.credential);
      login({ email: p.email.toLowerCase(), name: p.name || p.email });
    },
  });
  google.accounts.id.renderButton($('googleBtn'), { theme: 'outline', size: 'large', text: 'continue_with' });
}

function googleFallback() {
  const cid = prompt('Google OAuth Client ID daalo (Google Cloud Console → Credentials). Isko baad mein Settings mein bhi badal sakte ho:');
  if (!cid) return;
  store.set('bz_google_client', cid.trim());
  initGoogle();
  if ($('googleFallback').classList.contains('hidden')) return;
  $('authError').textContent = 'Google script abhi load nahi hua. Page refresh karke dobara try karo.';
}

/* ---------- navigation ---------- */
function showPage(p) {
  document.querySelectorAll('.page').forEach((el) => el.classList.add('hidden'));
  $('page-' + p).classList.remove('hidden');
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.page === p));
}

/* ---------- settings: API keys ---------- */
function renderProviders() {
  const keys = store.get(kKeys(), {});
  const box = $('providers');
  box.textContent = '';
  providers().forEach((p) => {
    const cfg = keys[p.id] || {};
    const card = document.createElement('div');
    card.className = 'prov';
    const h = document.createElement('h4');
    const title = document.createElement('span');
    title.textContent = p.name;
    const badge = document.createElement('span');
    badge.className = 'badge' + (cfg.key ? ' ok' : '');
    badge.textContent = cfg.key ? '● connected' : 'not set';
    h.append(title, badge);

    const row = document.createElement('div');
    row.className = 'row';
    const key = document.createElement('input');
    key.type = 'password';
    key.placeholder = 'API key';
    key.value = cfg.key || '';
    key.autocomplete = 'off';
    const model = document.createElement('input');
    model.placeholder = 'Model';
    model.value = cfg.model || p.model;
    const save = document.createElement('button');
    save.className = 'btn';
    save.type = 'button';
    save.textContent = 'Save';
    save.onclick = () => {
      const all = store.get(kKeys(), {});
      if (key.value.trim()) all[p.id] = { key: key.value.trim(), model: model.value.trim() || p.model };
      else delete all[p.id];
      store.set(kKeys(), all);
      renderProviders();
      renderAgentSelect();
    };
    row.append(key, model, save);
    if (p.custom) {
      const rm = document.createElement('button');
      rm.className = 'btn';
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.onclick = () => {
        store.set(kCustom(), store.get(kCustom(), []).filter((c) => c.id !== p.id));
        const all = store.get(kKeys(), {});
        delete all[p.id];
        store.set(kKeys(), all);
        renderProviders();
        renderAgentSelect();
      };
      row.append(rm);
    }
    card.append(h, row);
    box.append(card);
  });
}

function addCustom() {
  const name = $('cName').value.trim();
  const url = $('cUrl').value.trim().replace(/\/+$/, '');
  if (!name || !/^https:\/\//.test(url)) return alert('Name aur https:// wala Base URL zaroori hai.');
  const list = store.get(kCustom(), []);
  list.push({ id: 'c_' + Date.now(), name, kind: 'openai', url, model: $('cModel').value.trim() || 'default', custom: true });
  store.set(kCustom(), list);
  ['cName', 'cUrl', 'cModel'].forEach((i) => ($(i).value = ''));
  renderProviders();
  renderAgentSelect();
}

/* ---------- upload sheet ---------- */
function renderSheet() {
  const info = $('sheetInfo');
  const box = $('sheetPreview');
  box.textContent = '';
  if (!sheet) { info.textContent = 'Abhi koi sheet upload nahi hui.'; return; }
  info.textContent = `${sheet.name} — ${sheet.rows.length} rows (pehli 50 rows preview mein)`;
  const t = document.createElement('table');
  sheet.rows.slice(0, 50).forEach((r, i) => {
    const tr = document.createElement('tr');
    r.forEach((c) => {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      cell.textContent = c;
      tr.append(cell);
    });
    t.append(tr);
  });
  box.append(t);
}

async function onSheet(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (!window.XLSX) return ($('sheetInfo').textContent = 'Sheet library load nahi hui (internet check karo).');
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    sheet = { name: f.name, rows: rows.slice(0, 2000) };
    store.set(kSheet(), sheet);
  } catch {
    $('sheetInfo').textContent = 'File parse nahi ho saki. CSV ya Excel file try karo.';
    return;
  }
  renderSheet();
}

/* ---------- Agent AI ---------- */
function renderAgentSelect() {
  const keys = store.get(kKeys(), {});
  const sel = $('agentProvider');
  sel.textContent = '';
  const ready = providers().filter((p) => keys[p.id]);
  if (!ready.length) {
    const o = document.createElement('option');
    o.textContent = 'Pehle Settings mein API key daalo';
    o.value = '';
    sel.append(o);
    return;
  }
  ready.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel.append(o);
  });
}

function addMsg(role, text, cls) {
  history.push({ role, text, cls });
  renderChat();
}

function renderChat() {
  const c = $('chat');
  c.textContent = '';
  history.forEach((m) => {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.cls ? ' ' + m.cls : '');
    d.textContent = m.text;
    c.append(d);
  });
  c.scrollTop = c.scrollHeight;
}

function systemPrompt() {
  let s = 'You are a helpful business assistant. Answer simply and clearly.';
  if ($('useSheet').checked && sheet) {
    const csv = sheet.rows.slice(0, 200).map((r) => r.join(',')).join('\n').slice(0, 12000);
    s += `\n\nThe user uploaded a sheet named "${sheet.name}". Data (CSV, may be truncated):\n${csv}`;
  }
  return s;
}

async function callAI(p, cfg, msgs) {
  const sys = systemPrompt();
  if (p.kind === 'gemini') {
    const r = await fetch(`${p.url}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '(empty reply)';
  }
  if (p.kind === 'anthropic') {
    const r = await fetch(p.url + '/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model, max_tokens: 1024, system: sys,
        messages: msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.content?.map((x) => x.text).join('') || '(empty reply)';
  }
  const r = await fetch(p.url + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: sys }].concat(
        msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))),
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.statusText);
  return j.choices?.[0]?.message?.content || '(empty reply)';
}

async function onChat(e) {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  const p = providers().find((x) => x.id === $('agentProvider').value);
  const cfg = p && store.get(kKeys(), {})[p.id];
  if (!cfg) return addMsg('bot', 'Pehle Settings → API Cloud mein kisi AI ki API key save karo.', 'err');
  $('chatInput').value = '';
  addMsg('user', text);
  const convo = history.filter((m) => !m.cls);
  const btn = e.submitter;
  btn.disabled = true;
  try {
    addMsg('bot', await callAI(p, cfg, convo));
  } catch (err) {
    addMsg('bot', 'Error: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- boot ---------- */
$('tabLogin').onclick = () => setTab('login');
$('tabSignup').onclick = () => setTab('signup');
$('authForm').addEventListener('submit', onAuthSubmit);
$('googleFallback').onclick = googleFallback;
$('logout').onclick = logout;
$('cAdd').onclick = addCustom;
$('gSave').onclick = () => { store.set('bz_google_client', $('gClient').value.trim()); alert('Saved. Logout karke Google button check karo.'); };
$('sheetFile').addEventListener('change', onSheet);
$('chatForm').addEventListener('submit', onChat);
$('clearChat').onclick = () => { history = []; renderChat(); };
document.querySelectorAll('.nav').forEach((b) => (b.onclick = () => showPage(b.dataset.page)));

const saved = store.get('bz_session', null);
if (saved) login(saved);
else $('authPage').classList.remove('hidden');
window.addEventListener('load', initGoogle);
