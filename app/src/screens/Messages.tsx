import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { colors } from '../theme';
import { formatDate } from '../format';
import { messagesToCsv, saveText } from '../files';
import { messageOf, useStatusCounts, userCol } from '../hooks';
import { Button, Card, Chip, Empty, SearchBox, T, useLayout } from '../components/ui';
import { MessageTable } from '../components/MessageTable';
import { Shell } from '../components/Shell';
import { Message } from '../types';
import { useStore } from '../store';

const PAGE = 10;
type Filter = 'All' | 'Delivered' | 'Failed' | 'Not on WhatsApp';

const statusConstraint = (f: Filter): QueryConstraint[] =>
  f === 'Delivered' ? [where('status', 'in', ['delivered', 'read'])] : f === 'Failed' ? [where('status', '==', 'failed')] : f === 'Not on WhatsApp' ? [where('status', '==', 'not_on_whatsapp')] : [];

const matches = (m: Message, f: Filter) =>
  f === 'All' || (f === 'Delivered' ? m.status === 'delivered' || m.status === 'read' : f === 'Failed' ? m.status === 'failed' : m.status === 'not_on_whatsapp');

export default function Messages({ initialQuery = '' }: { initialQuery?: string }) {
  const { wide } = useLayout();
  const { user, campaigns, showToast } = useStore();
  const [text, setText] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>('All');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Message[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cursors = useRef<QueryDocumentSnapshot[]>([]);

  const c0 = campaigns[0];
  const refreshKey = c0 ? `${c0.id}-${c0.stats.sent}-${c0.stats.delivered}-${c0.stats.failed}-${c0.stats.notWhatsapp}` : 'none';
  const counts = useStatusCounts(refreshKey);

  useEffect(() => { setText(initialQuery); setSearch(initialQuery); }, [initialQuery]);
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setPage(0); cursors.current = []; }, [search, filter]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const col = userCol(user.uid, 'messages');
      if (search) {
        // Search by phone (digits) or by the start of the patient name
        const digits = search.replace(/\D/g, '');
        const byPhone = /^[+\d\s-]+$/.test(search) && digits.length > 0;
        const key = byPhone ? digits.replace(/^0/, '92') : search.toLowerCase();
        const q = query(col, where(byPhone ? 'phone' : 'patientLower', '>=', key), where(byPhone ? 'phone' : 'patientLower', '<=', `${key}`), limit(60));
        const found = (await getDocs(q)).docs.map((d) => messageOf(d.id, d.data())).filter((m) => m.direction === 'out' && matches(m, filter));
        setRows(found.slice(page * PAGE, page * PAGE + PAGE));
        setHasNext(found.length > (page + 1) * PAGE);
      } else {
        const cons: QueryConstraint[] = [...statusConstraint(filter), orderBy('outAt', 'desc')];
        if (page > 0 && cursors.current[page - 1]) cons.push(startAfter(cursors.current[page - 1]));
        const docs = (await getDocs(query(col, ...cons, limit(PAGE + 1)))).docs;
        const shown = docs.slice(0, PAGE);
        if (shown.length) cursors.current[page] = shown[shown.length - 1];
        setRows(shown.map((d) => messageOf(d.id, d.data())));
        setHasNext(docs.length > PAGE);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [user, search, filter, page]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const total = filter === 'All' ? counts.all : filter === 'Delivered' ? counts.delivered : filter === 'Failed' ? counts.failed : counts.notWa;
  const filters: [Filter, number | null][] = [['All', counts.all], ['Delivered', counts.delivered], ['Failed', counts.failed], ['Not on WhatsApp', counts.notWa]];
  const from = rows.length ? page * PAGE + 1 : 0;

  const exportCsv = async () => {
    if (!user) return;
    try {
      const all: Message[] = [];
      let last: QueryDocumentSnapshot | undefined;
      while (all.length < 5000) {
        const cons: QueryConstraint[] = [...statusConstraint(filter), orderBy('outAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(500)];
        const docs = (await getDocs(query(userCol(user.uid, 'messages'), ...cons))).docs;
        all.push(...docs.map((d) => messageOf(d.id, d.data())));
        if (docs.length < 500) break;
        last = docs[docs.length - 1];
      }
      await saveText(`messages-${new Date().toISOString().slice(0, 10)}.csv`, messagesToCsv(all));
      showToast(`Exported ${all.length.toLocaleString()} messages`);
    } catch {
      showToast('Could not export');
    }
  };

  return (
    <Shell title="Messages" subtitle={`Delivery result for every patient message · ${(counts.all ?? 0).toLocaleString()} total`}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: wide ? 'center' : 'stretch' }}>
            <SearchBox value={text} onChangeText={setText} placeholder="Search phone or patient" style={{ flex: wide ? 1 : undefined, maxWidth: wide ? 320 : undefined }} />
            {wide ? <View style={{ flex: 1 }} /> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Refresh" icon="refresh-cw" onPress={load} />
              <Button label="Export" icon="download" onPress={exportCsv} />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filters.map(([f, n]) => <Chip key={f} label={`${f}  ${n === null ? '…' : n.toLocaleString()}`} active={filter === f} onPress={() => setFilter(f)} />)}
          </ScrollView>
        </View>

        {error ? <View style={{ padding: 16 }}><T color={colors.danger}>{/index/i.test(error) ? 'This filter needs a database index. Run: firebase deploy --only firestore:indexes' : error}</T></View>
          : rows.length ? <MessageTable rows={rows} />
          : <Empty text={loading ? 'Loading…' : 'No messages found.'} />}

        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
          <T size={13} color={colors.muted}>
            {rows.length ? `Showing ${from}–${from + rows.length - 1}${!search && total !== null ? ` of ${total.toLocaleString()}` : ''} messages` : ' '}
          </T>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Button label="Prev" disabled={page === 0 || loading} onPress={() => setPage(page - 1)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
            <T size={13} color={colors.muted}>Page {page + 1}</T>
            <Button label="Next" disabled={!hasNext || loading} onPress={() => setPage(page + 1)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
          </View>
        </View>
      </Card>
    </Shell>
  );
}
