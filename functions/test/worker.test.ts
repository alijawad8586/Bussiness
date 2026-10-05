import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign } from '../src/messaging.js';
import { importSheet } from '../src/sheetImport.js';
import { handleRpc } from '../src/rpc.js';
import { runWorker } from '../src/worker.js';
import { col } from '../src/repo.js';
import { campaign, harness, messagesOf, seedUser, SHEET, type Harness } from './helpers.js';

const noSleep = async () => {};

async function started(h: Harness) {
  await seedUser(h);
  const r = await importSheet(h.uid, { fileName: 'p.csv', rows: SHEET }, h.deps);
  return createCampaign(h.uid, { sheetId: r.sheetId }, h.deps);
}

test('worker sends every queued message and completes the campaign', async () => {
  const h = harness();
  const c = await started(h);
  const r = await runWorker(h.uid, c.campaignId, h.deps, { budgetMs: 30_000, sleep: noSleep });
  assert.equal(r.remaining, 0);
  assert.equal(h.wa.calls.length, 3);
  const camp = await campaign(h, c.campaignId);
  assert.equal(camp.status, 'completed');
  assert.equal(camp.stats.sent, 3);
  // running again sends nothing twice
  await runWorker(h.uid, c.campaignId, h.deps, { budgetMs: 30_000, sleep: noSleep });
  assert.equal(h.wa.calls.length, 3);
});

test('worker does nothing for a paused campaign', async () => {
  const h = harness();
  const c = await started(h);
  await handleRpc('campaignAction', h.uid, { campaignId: c.campaignId, action: 'pause' }, h.deps);
  const r = await runWorker(h.uid, c.campaignId, h.deps, { budgetMs: 5_000, sleep: noSleep });
  assert.equal(r.processed, 0);
  assert.equal(h.wa.calls.length, 0);
});

test('temporary WhatsApp error: message waits (notBefore) and is retried later', async () => {
  const h = harness();
  const c = await started(h);
  let failFirst = true;
  h.wa.fail = (to) => (failFirst && to === '923001234567' ? { code: 131056, message: 'rate limit', httpStatus: 429 } : undefined);
  const r1 = await runWorker(h.uid, c.campaignId, h.deps, { budgetMs: 3_000, sleep: noSleep });
  assert.equal(r1.remaining, 1);
  const waiting = (await messagesOf(h, c.campaignId)).find((m) => m.status === 'queued');
  assert.ok(waiting.notBefore, 'back-off time is set');
  failFirst = false;
  h.clock.t += 120_000;
  const r2 = await runWorker(h.uid, c.campaignId, h.deps, { budgetMs: 10_000, sleep: noSleep });
  assert.equal(r2.remaining, 0);
  assert.equal((await campaign(h, c.campaignId)).stats.sent, 3);
});

test('rpc: createCampaign kicks a worker, unknown function is rejected, kick checks the report exists', async () => {
  const h = harness();
  const kicks: string[] = [];
  h.deps.kick = async (_u, id) => { kicks.push(id); };
  await seedUser(h);
  const imp: any = await handleRpc('importSheet', h.uid, { fileName: 'p.csv', rows: SHEET }, h.deps);
  assert.ok(imp.campaign.campaignId);
  assert.deepEqual(kicks, [imp.campaign.campaignId]);
  const k: any = await handleRpc('kick', h.uid, { campaignId: imp.campaign.campaignId }, h.deps);
  assert.equal(k.status, 'queued');
  assert.equal(kicks.length, 2);
  await assert.rejects(handleRpc('kick', h.uid, { campaignId: 'nope' }, h.deps), /not found/i);
  await assert.rejects(handleRpc('nope', h.uid, {}, h.deps), /Unknown function/);
  assert.equal((await col(h.uid, 'messages').get()).size, 3);
});
