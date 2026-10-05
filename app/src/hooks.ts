import { useEffect, useState } from 'react';
import { collection, getCountFromServer, onSnapshot, orderBy, query, Timestamp, where, limit, type DocumentData, type Query } from 'firebase/firestore';
import { db } from './firebase';
import { Message, ms } from './types';
import { useStore } from './store';

export function messageOf(id: string, d: DocumentData): Message {
  return {
    id, contactId: d.contactId, phone: d.phone ?? '', patient: d.patient ?? '', doctor: d.doctor ?? '', direction: d.direction, kind: d.kind, by: d.by,
    template: d.template ?? null, text: d.text ?? '', status: d.status, error: d.error ?? null, createdAt: ms(d.createdAt) ?? 0, outAt: ms(d.outAt),
  };
}

export const userCol = (uid: string, name: string) => collection(db, `users/${uid}/${name}`);
const EPOCH = Timestamp.fromMillis(0);

/** Number of documents matching a query. `key` changes when the query should be asked again. */
export function useCount(make: (() => Query) | null, key: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!make) return;
    let alive = true;
    getCountFromServer(make()).then((s) => alive && setN(s.data().count)).catch(() => alive && setN(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return n;
}

/** The latest few outbound messages, live. */
export function useRecentOut(n: number): Message[] {
  const { user } = useStore();
  const [rows, setRows] = useState<Message[]>([]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(userCol(user.uid, 'messages'), orderBy('outAt', 'desc'), limit(n)), (s) => setRows(s.docs.map((d) => messageOf(d.id, d.data()))), () => {});
  }, [user, n]);
  return rows;
}

/** Messages sent per day for the last 7 days (oldest first). */
export function useLast7Days(refreshKey: string): [string, number][] {
  const { user } = useStore();
  const [data, setData] = useState<[string, number][]>([]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    Promise.all(days.map(async (d) => {
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const q = query(userCol(user.uid, 'messages'), where('outAt', '>=', Timestamp.fromDate(d)), where('outAt', '<', Timestamp.fromDate(next)));
      const c = (await getCountFromServer(q)).data().count;
      return [d.toLocaleDateString([], { weekday: 'short' }), c] as [string, number];
    })).then((r) => alive && setData(r)).catch(() => {});
    return () => { alive = false; };
  }, [user, refreshKey]);
  return data;
}

/** Counts for the Messages page chips. */
export function useStatusCounts(refreshKey: string) {
  const { user } = useStore();
  const base = (extra: any[] = []) => () => query(userCol(user!.uid, 'messages'), ...extra, where('outAt', '>', EPOCH));
  const enabled = !!user;
  const all = useCount(enabled ? base() : null, refreshKey);
  const delivered = useCount(enabled ? base([where('status', 'in', ['delivered', 'read'])]) : null, refreshKey);
  const failed = useCount(enabled ? base([where('status', '==', 'failed')]) : null, refreshKey);
  const notWa = useCount(enabled ? base([where('status', '==', 'not_on_whatsapp')]) : null, refreshKey);
  return { all, delivered, failed, notWa };
}
