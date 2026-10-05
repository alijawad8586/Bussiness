import { Timestamp } from 'firebase-admin/firestore';
import { performSend, RetryLater } from './messaging.js';
import { col, db, type Deps } from './repo.js';
import type { MessageDoc } from './types.js';

export interface WorkerResult {
  /** messages handled in this run */
  processed: number;
  /** messages still waiting (the caller should start another run if this is above 0 and the campaign is running) */
  remaining: number;
  status: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sends the queued messages of one campaign, one by one, at the campaign's speed.
 * It works for `budgetMs` and then stops, so it fits inside a serverless time limit.
 * Several workers may run at once: they share the speed limit and never send the same message twice.
 */
export async function runWorker(
  uid: string,
  campaignId: string,
  deps: Deps,
  opts: { budgetMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<WorkerResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const started = Date.now();
  const left = () => opts.budgetMs - (Date.now() - started);
  const cRef = col(uid, 'campaigns').doc(campaignId);
  let processed = 0;
  let status = 'unknown';

  while (left() > 0) {
    const c = await cRef.get();
    if (!c.exists) break;
    status = c.data()!.status;
    if (status !== 'queued' && status !== 'running') break;
    const gap = Math.round(60_000 / Math.max(1, Number(c.data()!.speed) || 20));

    const queued = await col(uid, 'messages').where('campaignId', '==', campaignId).where('status', '==', 'queued').limit(40).get();
    if (queued.empty) break;

    const now = deps.now().getTime();
    const ms = (t?: Timestamp | null) => (t ? t.toMillis() : 0);
    const ready = queued.docs.filter((d) => {
      const m = d.data() as MessageDoc;
      return ms(m.notBefore) <= now && ms(m.lockedUntil) <= now;
    });

    if (!ready.length) {
      // everything is waiting (back-off) or being sent by another worker
      const wake = Math.min(...queued.docs.map((d) => Math.max(ms((d.data() as MessageDoc).notBefore), ms((d.data() as MessageDoc).lockedUntil))));
      const wait = Math.max(200, wake - now);
      if (wait > left()) break;
      await sleep(Math.min(wait, 5000));
      continue;
    }

    // reserve the next sending slot, so workers together never go faster than the speed setting
    const wait = await db().runTransaction(async (t) => {
      const snap = await t.get(cRef);
      const slot = Math.max(deps.now().getTime(), ms(snap.data()?.nextSendAt));
      t.update(cRef, { nextSendAt: Timestamp.fromMillis(slot + gap) });
      return slot - deps.now().getTime();
    });
    if (wait > 0) {
      if (wait > left()) break;
      await sleep(wait);
    }

    const target = ready[0];
    try {
      await performSend(uid, target.id, { retryable: true }, deps);
    } catch (e) {
      if (!(e instanceof RetryLater)) throw e;
      // temporary WhatsApp problem: try this message again later (30 s, 60 s, 2 min ... up to 15 min)
      const attempts = Number((await target.ref.get()).data()?.attempts ?? 1);
      const backoff = Math.min(900_000, 30_000 * 2 ** Math.max(0, attempts - 1));
      await target.ref.update({ notBefore: Timestamp.fromMillis(deps.now().getTime() + backoff) });
    }
    processed++;
  }

  const c = await cRef.get();
  status = c.data()?.status ?? status;
  const remaining = c.exists ? ((await col(uid, 'messages').where('campaignId', '==', campaignId).where('status', '==', 'queued').count().get()).data().count as number) : 0;
  return { processed, remaining, status };
}
