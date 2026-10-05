import test from 'node:test';
import assert from 'node:assert/strict';
import { col, mainRef, serverRef } from '../src/repo.js';
import { importSheet } from '../src/sheetImport.js';
import { campaignAction, createCampaign, performSend, RetryLater, sendManual, sendTemplateToContact } from '../src/messaging.js';
import { handleWebhook } from '../src/webhook.js';
import { campaign, contact, harness, messagesOf, seedUser, SHEET, ts, type Harness } from './helpers.js';

async function imported(h: Harness, rows: unknown[][] = SHEET) {
  await seedUser(h);
  return importSheet(h.uid, { fileName: 'p.csv', rows }, h.deps);
}
async function runAll(h: Harness, ids: string[]) {
  const out: string[] = [];
  for (const id of ids) out.push(await performSend(h.uid, id, { retryable: true }, h.deps));
  return out;
}

test('import creates one contact per valid row, reports bad rows, and never duplicates', async () => {
  const h = harness();
  const rows = [...SHEET, ['not a phone', 'Bad Row', 'Dr. X', ''], ['0300 1234567', 'Dup', 'Dr. Y', ''], ['', '', '', '']];
  const r = await imported(h, rows);
  assert.equal(r.created, 3);
  assert.equal(r.skipped, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.errors[0].row, 5);
  const c = await contact(h, '923001234567');
  assert.equal(c.name, 'Ayesha Khan');
  assert.equal(c.doctor, 'Dr. Imran Qureshi');
  assert.equal(c.fields.time, '4:30 PM');

  const again = await importSheet(h.uid, { fileName: 'p.csv', rows }, h.deps);
  assert.equal(again.created, 0);
  assert.equal(again.updated, 3);
  assert.equal((await col(h.uid, 'contacts').get()).size, 3);
});

test('import needs the phone column to be chosen', async () => {
  const h = harness();
  await seedUser(h, { mapping: { phoneCol: '', patientCol: '', doctorCol: '' } });
  await assert.rejects(importSheet(h.uid, { fileName: 'x', rows: SHEET }, h.deps), /phone number column/);
  await assert.rejects(importSheet(h.uid, { fileName: 'x', rows: [['phone']] }, h.deps), /header row/);
});

test('campaign sends every contact one by one and finishes', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  assert.equal(c.total, 3);
  assert.equal(h.sent.length, 3);
  assert.deepEqual(h.sent.map((s) => s.delay), [0, 1, 2]); // speed 60/min = 1 per second

  const msgs = await messagesOf(h, c.campaignId);
  assert.equal(msgs.every((m) => m.status === 'queued'), true);
  assert.equal(msgs[0].text.includes('{{'), false);

  assert.deepEqual(await runAll(h, h.sent.map((s) => s.messageId)), ['sent', 'sent', 'sent']);
  const camp = await campaign(h, c.campaignId);
  assert.deepEqual(camp.stats, { queued: 0, sent: 3, delivered: 0, failed: 0, notWhatsapp: 0 });
  assert.equal(camp.status, 'completed');
  const call = h.wa.calls.find((x) => x.to === '923001234567')!;
  assert.deepEqual(call.params, ['Ayesha Khan', 'Dr. Imran Qureshi']);
  assert.equal((await contact(h, '923001234567')).lastStatus, 'sent');
});

test('sending the same message twice sends once', async () => {
  const h = harness();
  const r = await imported(h);
  await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  const id = h.sent[0].messageId;
  const [a, b] = await Promise.all([performSend(h.uid, id, { retryable: true }, h.deps), performSend(h.uid, id, { retryable: true }, h.deps)]);
  assert.deepEqual([a, b].sort(), ['sent', 'skipped']);
  assert.equal(h.wa.calls.length, 1);
  assert.equal(await performSend(h.uid, id, { retryable: true }, h.deps), 'skipped');
});

test('delivery receipts update messages and counters; late or repeated receipts are ignored', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  await runAll(h, h.sent.map((s) => s.messageId));
  const msgs = await messagesOf(h, c.campaignId);
  const first = msgs.find((m) => m.phone === '923001234567');
  const phoneNumberId = `pn_${h.uid}`;
  const hook = (status: string, id: string, errors?: unknown[]) => ({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id, status, errors }] } }] }] });

  await handleWebhook(hook('delivered', first.waMessageId), h.deps);
  await handleWebhook(hook('read', first.waMessageId), h.deps);
  await handleWebhook(hook('delivered', first.waMessageId), h.deps); // out of order: ignored
  await handleWebhook(hook('delivered', first.waMessageId), h.deps); // repeat
  let camp = await campaign(h, c.campaignId);
  assert.equal(camp.stats.delivered, 1);
  assert.equal(camp.stats.sent, 2);
  assert.equal(camp.byDoctor['Dr Imran Qureshi'].delivered, 1);
  assert.equal((await col(h.uid, 'messages').doc(first.id).get()).data()!.status, 'read');

  const second = msgs.find((m) => m.phone === '923217788990');
  await handleWebhook(hook('failed', second.waMessageId, [{ code: 131026, title: 'Undeliverable' }]), h.deps);
  camp = await campaign(h, c.campaignId);
  assert.equal(camp.stats.notWhatsapp, 1);
  assert.equal((await contact(h, '923217788990')).whatsapp, 'invalid');
  // a delivered message cannot become failed later
  await handleWebhook(hook('failed', first.waMessageId, [{ code: 131000 }]), h.deps);
  assert.equal((await campaign(h, c.campaignId)).stats.failed, 0);
});

test('errors: not on WhatsApp, permanent failure, and temporary problems', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  let tries = 0;
  h.wa.fail = (to) => {
    if (to === '923001234567') return { code: 131026, message: 'undeliverable', httpStatus: 400 };
    if (to === '923217788990') return { code: 131030, message: 'not in allowed list', httpStatus: 400 };
    if (to === '923334561230' && ++tries < 3) return { code: 130429, message: 'rate limit', httpStatus: 429 };
    return undefined;
  };
  const ids = h.sent.map((s) => s.messageId);
  assert.equal(await performSend(h.uid, ids[0], { retryable: true }, h.deps), 'not_on_whatsapp');
  assert.equal(await performSend(h.uid, ids[1], { retryable: true }, h.deps), 'failed');
  await assert.rejects(performSend(h.uid, ids[2], { retryable: true }, h.deps), RetryLater);
  await assert.rejects(performSend(h.uid, ids[2], { retryable: true }, h.deps), RetryLater);
  assert.equal(await performSend(h.uid, ids[2], { retryable: true }, h.deps), 'sent'); // third try works

  const camp = await campaign(h, c.campaignId);
  assert.deepEqual(camp.stats, { queued: 0, sent: 1, delivered: 0, failed: 1, notWhatsapp: 1 });
  assert.equal(camp.status, 'completed');
  assert.equal(camp.failReasons.c131030.count, 1);
  assert.match(camp.failReasons.c131030.label, /allowed test list/);
});

test('a temporary problem that never goes away becomes a failed message after 5 tries', async () => {
  const h = harness();
  const r = await imported(h);
  await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  h.wa.fail = () => ({ code: 0, message: 'timeout', httpStatus: 0 });
  const id = h.sent[0].messageId;
  for (let i = 0; i < 4; i++) await assert.rejects(performSend(h.uid, id, { retryable: true }, h.deps), RetryLater);
  assert.equal(await performSend(h.uid, id, { retryable: true }, h.deps), 'failed');
  const m = (await col(h.uid, 'messages').doc(id).get()).data()!;
  assert.equal(m.status, 'failed');
  assert.equal(m.attempts, 5);
});

test('an expired token pauses the campaign; fixing it and pressing Resume sends the rest', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  h.wa.fail = () => ({ code: 190, message: 'expired', httpStatus: 401 });
  assert.equal(await performSend(h.uid, h.sent[0].messageId, { retryable: true }, h.deps), 'campaign_stopped');
  let camp = await campaign(h, c.campaignId);
  assert.equal(camp.status, 'paused');
  assert.match(camp.error, /token/i);
  assert.equal((await serverRef(h.uid).get()).data()!.whatsapp.connected, false);
  // other queued messages wait instead of failing one by one
  assert.equal(await performSend(h.uid, h.sent[1].messageId, { retryable: true }, h.deps), 'paused');
  assert.equal((await messagesOf(h, c.campaignId)).every((m) => m.status === 'queued'), true);

  // user reconnects (connected=true) and presses Resume
  h.wa.fail = () => undefined;
  await serverRef(h.uid).set({ whatsapp: { connected: true } }, { merge: true });
  h.sent.length = 0;
  const res = await campaignAction(h.uid, { campaignId: c.campaignId, action: 'resume' }, h.deps);
  assert.equal(res.count, 3);
  assert.deepEqual(await runAll(h, h.sent.map((s) => s.messageId)), ['sent', 'sent', 'sent']);
  camp = await campaign(h, c.campaignId);
  assert.equal(camp.stats.sent, 3);
  assert.equal(camp.status, 'completed');
});

test('a wrong template stops the campaign and nothing is marked failed', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  h.wa.fail = () => ({ code: 132001, message: 'template does not exist', httpStatus: 404 });
  assert.equal(await performSend(h.uid, h.sent[0].messageId, { retryable: true }, h.deps), 'campaign_stopped');
  const camp = await campaign(h, c.campaignId);
  assert.equal(camp.status, 'paused');
  assert.equal(camp.stats.failed, 0);
});

test('Retry failed puts failed messages back in the queue and fixes the counters', async () => {
  const h = harness();
  const r = await imported(h);
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  h.wa.fail = (to) => (to === '923001234567' ? { code: 131030, message: 'x', httpStatus: 400 } : undefined);
  await runAll(h, h.sent.map((s) => s.messageId));
  assert.equal((await campaign(h, c.campaignId)).stats.failed, 1);
  h.wa.fail = () => undefined;
  h.sent.length = 0;
  await campaignAction(h.uid, { campaignId: c.campaignId, action: 'retryFailed' }, h.deps);
  assert.equal(h.sent.length, 1);
  await runAll(h, h.sent.map((s) => s.messageId));
  const camp = await campaign(h, c.campaignId);
  assert.deepEqual(camp.stats, { queued: 0, sent: 3, delivered: 0, failed: 0, notWhatsapp: 0 });
  assert.deepEqual(camp.failReasons, {});
});

test('campaign refuses to start without a template variable column or connection', async () => {
  const h = harness();
  const r = await imported(h);
  await mainRef(h.uid).update({ varCols: ['name', 'nope'] });
  await assert.rejects(createCampaign(h.uid, { sheetId: r.sheetId }, h.deps), /column for every template variable/);
  await mainRef(h.uid).update({ varCols: ['name', 'doctor'] });
  await serverRef(h.uid).set({ whatsapp: { connected: false } }, { merge: true });
  await assert.rejects(createCampaign(h.uid, { sheetId: r.sheetId }, h.deps), /not connected/);
});

test('patients who replied STOP are skipped by campaigns', async () => {
  const h = harness();
  const r = await imported(h);
  await col(h.uid, 'contacts').doc('923001234567').update({ optOut: true });
  const c = await createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
  assert.equal(c.total, 2);
  assert.equal(c.skippedOptOut, 1);
});

test('inbox: free text needs a message from the patient in the last 24 hours', async () => {
  const h = harness();
  await imported(h);
  await assert.rejects(sendManual(h.uid, { contactId: '923001234567', text: 'hello' }, h.deps), /24 hours/);
  await col(h.uid, 'contacts').doc('923001234567').update({ lastInboundAt: ts(h.clock.t - 3600_000) });
  const r = await sendManual(h.uid, { contactId: '923001234567', text: 'hello' }, h.deps);
  assert.equal(r.status, 'sent');
  assert.equal(h.wa.calls.at(-1)!.text, 'hello');
  await col(h.uid, 'contacts').doc('923001234567').update({ lastInboundAt: ts(h.clock.t - 25 * 3600_000) });
  await assert.rejects(sendManual(h.uid, { contactId: '923001234567', text: 'late' }, h.deps), /24 hours/);
  // a template is always allowed
  const t = await sendTemplateToContact(h.uid, { contactId: '923001234567' }, h.deps);
  assert.equal(t.status, 'sent');
  assert.deepEqual(h.wa.calls.at(-1)!.params, ['Ayesha Khan', 'Dr. Imran Qureshi']);
});

test('inbox: a failed one-off message is recorded as failed, not left queued', async () => {
  const h = harness();
  await imported(h);
  h.wa.fail = () => ({ code: 190, message: 'expired', httpStatus: 401 });
  const t = await sendTemplateToContact(h.uid, { contactId: '923001234567' }, h.deps);
  assert.equal(t.status, 'failed');
  assert.match(t.error!.hint, /token/i);
});
