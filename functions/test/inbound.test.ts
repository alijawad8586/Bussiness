import test from 'node:test';
import assert from 'node:assert/strict';
import { col, mainRef, serverRef, secretsRef } from '../src/repo.js';
import { agentReply } from '../src/agent.js';
import { RetryLater } from '../src/messaging.js';
import { importSheet } from '../src/sheetImport.js';
import { handleWebhook } from '../src/webhook.js';
import { connectWhatsApp, saveAgent, testAgent } from '../src/setup.js';
import { aiTransient, contact, harness, seedUser, SHEET, type Harness } from './helpers.js';
import { AiError } from '../src/aiClient.js';

const inbound = (h: Harness, from: string, text: string, id: string, name = 'Ayesha') => ({
  entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: `pn_${h.uid}` },
    contacts: [{ wa_id: from, profile: { name } }],
    messages: [{ id, from, timestamp: String(Math.floor(h.clock.t / 1000)), type: 'text', text: { body: text } }],
  } }] }],
});

async function agentOn(h: Harness) {
  await seedUser(h, { agentEnabled: true });
  await serverRef(h.uid).set({ agent: { provider: 'openai', model: 'm', hasKey: true } }, { merge: true });
  await secretsRef(h.uid).set({ aiKey: 'sk-test' }, { merge: true });
  await importSheet(h.uid, { fileName: 'p.csv', rows: SHEET }, h.deps);
}

test('an incoming message creates/updates the contact, is saved once, and counts as unread', async () => {
  const h = harness();
  await seedUser(h);
  await importSheet(h.uid, { fileName: 'p.csv', rows: SHEET }, h.deps);
  const payload = inbound(h, '923001234567', 'YES, I will be there', 'wamid.IN1');
  const r1 = await handleWebhook(payload, h.deps);
  const r2 = await handleWebhook(payload, h.deps); // Meta sent it twice
  assert.equal(r1.inbound, 1);
  assert.equal(r2.inbound, 0);
  const c = await contact(h, '923001234567');
  assert.equal(c.unread, 1);
  assert.equal(c.lastMessageText, 'YES, I will be there');
  assert.equal(c.name, 'Ayesha Khan'); // sheet data is kept
  assert.equal((await col(h.uid, 'messages').where('direction', '==', 'in').get()).size, 1);
  assert.equal(h.agentJobs.length, 0); // agent mode is off
});

test('an unknown patient who writes first becomes a contact', async () => {
  const h = harness();
  await seedUser(h);
  await handleWebhook(inbound(h, '923009998887', 'Hello', 'wamid.IN2', 'New Person'), h.deps);
  const c = await contact(h, '923009998887');
  assert.equal(c.name, 'New Person');
  assert.equal(c.unread, 1);
});

test('messages for a number we do not manage are ignored', async () => {
  const h = harness();
  const r = await handleWebhook({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'unknown' }, messages: [{ id: 'x', from: '1', type: 'text', text: { body: 'a' } }] } }] }] }, h.deps);
  assert.deepEqual(r, { inbound: 0, statuses: 0, failures: 0 });
});

test('STOP always unsubscribes; START subscribes again', async () => {
  const h = harness();
  await seedUser(h);
  await importSheet(h.uid, { fileName: 'p.csv', rows: SHEET }, h.deps);
  await handleWebhook(inbound(h, '923001234567', 'STOP', 'wamid.S1'), h.deps);
  assert.equal((await contact(h, '923001234567')).optOut, true);
  await handleWebhook(inbound(h, '923001234567', 'start', 'wamid.S2'), h.deps);
  assert.equal((await contact(h, '923001234567')).optOut, false);
});

test('agent mode queues a reply job for each incoming text', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'What time is my appointment?', 'wamid.A1'), h.deps);
  assert.deepEqual(h.agentJobs, [{ uid: h.uid, messageId: 'in_wamid.A1' }]);
});

test('agent answers using the chat history and the patient details, and saves its reply', async () => {
  const h = harness();
  await agentOn(h);
  h.aiResult = () => 'Your appointment is at 4:30 PM with Dr. Imran Qureshi.';
  await handleWebhook(inbound(h, '923001234567', 'What time is my appointment?', 'wamid.A2'), h.deps);
  const out = await agentReply(h.uid, 'in_wamid.A2', h.deps, { lastAttempt: false });
  assert.equal(out, 'replied');
  assert.match(h.aiCalls[0].system, /Ayesha Khan/);
  assert.match(h.aiCalls[0].system, /4:30 PM/);
  assert.deepEqual(h.aiCalls[0].history.at(-1), { role: 'user', text: 'What time is my appointment?' });
  assert.equal(h.wa.calls.at(-1)!.text, 'Your appointment is at 4:30 PM with Dr. Imran Qureshi.');
  const sent = (await col(h.uid, 'messages').where('by', '==', 'agent').get()).docs[0].data();
  assert.equal(sent.status, 'sent');
  // same job twice (task retry) does not answer twice
  assert.equal(await agentReply(h.uid, 'in_wamid.A2', h.deps, { lastAttempt: false }), 'skipped');
  assert.equal(h.wa.calls.length, 1);
});

test('agent hands emergencies to staff without calling the AI', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'I have chest pain', 'wamid.E1'), h.deps);
  assert.equal(await agentReply(h.uid, 'in_wamid.E1', h.deps, { lastAttempt: false }), 'handoff');
  assert.equal(h.aiCalls.length, 0);
  assert.match(h.wa.calls.at(-1)!.text!, /urgent/);
  assert.equal((await contact(h, '923001234567')).needsHuman, true);
  // later messages are left to staff
  await handleWebhook(inbound(h, '923001234567', 'ok thanks', 'wamid.E2'), h.deps);
  assert.equal(await agentReply(h.uid, 'in_wamid.E2', h.deps, { lastAttempt: false }), 'handoff');
  assert.equal(h.aiCalls.length, 0);
});

test('agent confirms STOP and does not answer opted-out patients', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'STOP', 'wamid.P1'), h.deps);
  assert.equal(await agentReply(h.uid, 'in_wamid.P1', h.deps, { lastAttempt: false }), 'opted_out');
  assert.match(h.wa.calls.at(-1)!.text!, /unsubscribed/);
  await handleWebhook(inbound(h, '923001234567', 'hello?', 'wamid.P2'), h.deps);
  assert.equal(await agentReply(h.uid, 'in_wamid.P2', h.deps, { lastAttempt: false }), 'opted_out');
  assert.equal(h.aiCalls.length, 0);
});

test('agent is capped at 8 automatic replies per patient per hour', async () => {
  const h = harness();
  await agentOn(h);
  const results: string[] = [];
  for (let i = 0; i < 10; i++) {
    await handleWebhook(inbound(h, '923001234567', `question ${i}`, `wamid.R${i}`), h.deps);
    results.push(await agentReply(h.uid, `in_wamid.R${i}`, h.deps, { lastAttempt: false }));
  }
  assert.equal(results.filter((r) => r === 'replied').length, 8);
  assert.equal(results.at(-1), 'rate_limited');
  h.clock.t += 3601_000; // an hour later it works again
  await handleWebhook(inbound(h, '923001234567', 'later', 'wamid.R99'), h.deps);
  assert.equal(await agentReply(h.uid, 'in_wamid.R99', h.deps, { lastAttempt: false }), 'replied');
});

test('agent does nothing when it is switched off or has no key', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'hi', 'wamid.D1'), h.deps);
  await mainRef(h.uid).update({ agentEnabled: false });
  assert.equal(await agentReply(h.uid, 'in_wamid.D1', h.deps, { lastAttempt: false }), 'disabled');
  assert.equal(h.wa.calls.length, 0);
});

test('AI problems: temporary ones retry, permanent ones leave the message for staff', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'hello', 'wamid.F1'), h.deps);
  h.aiResult = () => aiTransient();
  await assert.rejects(agentReply(h.uid, 'in_wamid.F1', h.deps, { lastAttempt: false }), RetryLater);
  h.aiResult = () => 'Hello Ayesha!';
  assert.equal(await agentReply(h.uid, 'in_wamid.F1', h.deps, { lastAttempt: false }), 'replied');

  await handleWebhook(inbound(h, '923001234567', 'again', 'wamid.F2'), h.deps);
  h.aiResult = () => new AiError('401: bad key', false);
  assert.equal(await agentReply(h.uid, 'in_wamid.F2', h.deps, { lastAttempt: false }), 'ai_failed');
  assert.equal(h.wa.calls.length, 1); // nothing was sent to the patient
  assert.match((await serverRef(h.uid).get()).data()!.agent.lastError, /bad key/);
  assert.match((await col(h.uid, 'messages').doc('in_wamid.F2').get()).data()!.agentError, /bad key/);

  await handleWebhook(inbound(h, '923001234567', 'third', 'wamid.F3'), h.deps);
  h.aiResult = () => aiTransient();
  assert.equal(await agentReply(h.uid, 'in_wamid.F3', h.deps, { lastAttempt: true }), 'ai_failed'); // gave up
});

test('connecting WhatsApp verifies the token, hides it, and blocks stealing a number', async () => {
  const h = harness();
  const input = { productId: 'CLN-1', wabaId: '123456', phoneNumberId: '999111', token: 'good-token-1234567890123' };
  await assert.rejects(connectWhatsApp(h.uid, { ...input, token: 'bad-token-12345678901234' }, h.deps), /rejected this access token/);
  assert.equal((await serverRef(h.uid).get()).exists, false);
  const r = await connectWhatsApp(h.uid, input, h.deps);
  assert.equal(r.displayNumber, '+92 300 0000000');
  const srv = (await serverRef(h.uid).get()).data()!;
  assert.equal(srv.whatsapp.connected, true);
  assert.equal(JSON.stringify(srv).includes('good-token'), false); // token is only in the private doc
  assert.equal((await secretsRef(h.uid).get()).data()!.whatsappToken, input.token);
  const other = harness();
  await assert.rejects(connectWhatsApp(other.uid, input, other.deps), /another account/);
});

test('saving the agent: key required, custom URL checked, test call works', async () => {
  const h = harness();
  await assert.rejects(saveAgent(h.uid, { provider: 'gemini', enabled: true }, h.deps), /API key/);
  await assert.rejects(saveAgent(h.uid, { provider: 'nope', apiKey: 'k', enabled: true }, h.deps), /provider/);
  await assert.rejects(saveAgent(h.uid, { provider: 'custom', apiKey: 'k', baseUrl: 'http://evil.com', model: 'm', enabled: true }, h.deps), /https/);
  await saveAgent(h.uid, { provider: 'gemini', apiKey: 'AIza-test', enabled: true }, h.deps);
  let srv = (await serverRef(h.uid).get()).data()!;
  assert.equal(srv.agent.provider, 'gemini');
  assert.equal(srv.agent.model, 'gemini-2.5-flash');
  assert.equal(JSON.stringify(srv).includes('AIza'), false);
  assert.equal((await mainRef(h.uid).get()).data()!.agentEnabled, true);
  // changing provider without pasting the key again keeps the saved key
  await saveAgent(h.uid, { provider: 'openai', enabled: false }, h.deps);
  assert.equal((await secretsRef(h.uid).get()).data()!.aiKey, 'AIza-test');
  assert.equal((await testAgent(h.uid, h.deps)).ok, true);
  h.aiResult = () => new AiError('401: invalid key', false);
  await assert.rejects(testAgent(h.uid, h.deps), /rejected this API key/);
});

test('connect accepts IDs pasted with spaces, plus signs or dashes', async () => {
  const h = harness();
  await connectWhatsApp(h.uid, { productId: 'p', wabaId: ' 1234 5678 ', phoneNumberId: '+1234-567-890', token: 'good-token-1234567890123' }, h.deps);
  const w = (await serverRef(h.uid).get()).data()!.whatsapp;
  assert.equal(w.phoneNumberId, '1234567890');
  assert.equal(w.wabaId, '12345678');
  await assert.rejects(connectWhatsApp(h.uid, { productId: 'p', wabaId: '12', phoneNumberId: '99', token: 'good-token-1234567890123' }, h.deps), /numbers only/);
});

test('webhook remembers when WhatsApp last called, and connecting subscribes the app to the account', async () => {
  const h = harness();
  const c = await connectWhatsApp(h.uid, { productId: 'P', wabaId: '1234567', phoneNumberId: '7654321', token: 'good-token-for-tests-123456' }, h.deps);
  assert.equal(c.webhookSubscribed, true);
  assert.deepEqual(h.wa.subscribed, ['1234567']);
  assert.equal((await serverRef(h.uid).get()).data()!.whatsapp.webhookSubscribed, true);

  await handleWebhook({ entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: '7654321' }, contacts: [{ wa_id: '971586141832', profile: { name: 'Ali Jawad' } }],
    messages: [{ id: 'wamid.in1', from: '971586141832', timestamp: '1', type: 'text', text: { body: 'hi' } }],
  } }] }] }, h.deps);
  const w = (await serverRef(h.uid).get()).data()!.webhook;
  assert.equal(w.inbound, 1);
  assert.ok(w.lastAt);
});

test('AI agent: only the key is needed. The key is verified, a model is chosen, and a retired model is replaced', async () => {
  const h = harness();
  await seedUser(h);
  await assert.rejects(saveAgent(h.uid, { provider: 'groq', apiKey: 'bad-key', enabled: true }, h.deps), /rejected this API key/);
  assert.equal((await secretsRef(h.uid).get()).data()?.aiKey, undefined, 'a rejected key is not saved');

  h.models = ['llama-3.1-8b-instant', 'whisper-large-v3', 'llama-guard-4-12b', 'qwen3-32b'];
  const r = await saveAgent(h.uid, { provider: 'groq', apiKey: 'gsk-good', enabled: true }, h.deps);
  assert.equal(r.model, 'llama-3.1-8b-instant');
  assert.equal(r.verified, true);
  assert.equal((await serverRef(h.uid).get()).data()!.agent.model, 'llama-3.1-8b-instant');

  await assert.rejects(saveAgent(h.uid, { provider: 'groq', model: 'does-not-exist', enabled: true }, h.deps), /not available for this key/);

  // the saved model is retired later: the connection test finds another one by itself
  await serverRef(h.uid).set({ agent: { model: 'llama-3.3-70b-versatile' } }, { merge: true });
  const calls: string[] = [];
  h.deps.ai = async (cfg) => {
    calls.push(cfg.model);
    if (cfg.model === 'llama-3.3-70b-versatile') throw new AiError('404: The model does not exist', false);
    return 'OK';
  };
  const t = await testAgent(h.uid, h.deps);
  assert.equal(t.ok, true);
  assert.deepEqual(calls, ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
  assert.equal((await serverRef(h.uid).get()).data()!.agent.model, 'llama-3.1-8b-instant');
});

test('agent: the outcome is saved on the patient message (why it did or did not answer)', async () => {
  const h = harness();
  await agentOn(h);
  await handleWebhook(inbound(h, '923001234567', 'What time is my appointment?', 'wamid.o1'), h.deps);
  await agentReply(h.uid, 'in_wamid.o1', h.deps, { lastAttempt: true });
  assert.equal((await col(h.uid, 'messages').doc('in_wamid.o1').get()).data()!.agentOutcome, 'replied');

  await mainRef(h.uid).set({ agentEnabled: false }, { merge: true });
  await handleWebhook(inbound(h, '923001234567', 'Hello?', 'wamid.o2'), h.deps);
  await agentReply(h.uid, 'in_wamid.o2', h.deps, { lastAttempt: true });
  assert.equal((await col(h.uid, 'messages').doc('in_wamid.o2').get()).data()!.agentOutcome, 'disabled');
});
