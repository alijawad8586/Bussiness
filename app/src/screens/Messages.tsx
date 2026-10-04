import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import { colors, font, Status } from '../theme';
import { MESSAGES, Msg, formatDate, summarize, TODAY } from '../data';
import { Button, Card, Chip, Empty, SearchBox, T, useLayout } from '../components/ui';
import { MessageTable } from '../components/MessageTable';
import { Shell } from '../components/Shell';
import { useStore } from '../store';

const PAGE = 10;
type Filter = 'All' | Status;

export function toCsv(rows: Msg[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = 'Phone number,Patient name,Doctor,Message,Status,Time';
  return [head, ...rows.map((m) => [m.phone, m.patient, m.doctor, m.text, m.status, m.time].map(esc).join(','))].join('\n');
}

/** Web: download a file. Phones: open the share sheet with the text. */
export async function saveText(name: string, text: string, mime = 'text/csv') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ message: text, title: name });
  }
}

export default function Messages({ initialQuery = '' }: { initialQuery?: string }) {
  const { wide } = useLayout();
  const { showToast } = useStore();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>('All');
  const [page, setPage] = useState(1);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setPage(1), [query, filter]);

  const counts = useMemo(() => summarize(MESSAGES), []);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MESSAGES.filter(
      (m) => (filter === 'All' || m.status === filter) && (!q || m.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || m.patient.toLowerCase().includes(q)),
    );
  }, [query, filter]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const from = rows.length ? (cur - 1) * PAGE + 1 : 0;

  const filters: [Filter, number][] = [
    ['All', counts.sent], ['Delivered', counts.delivered], ['Failed', counts.failed], ['Not on WhatsApp', counts.notWa],
  ];

  // Compact page list: 1 2 3 … last
  const pageList: (number | '…')[] = pages <= 5
    ? Array.from({ length: pages }, (_, i) => i + 1)
    : [...new Set([1, 2, 3, cur, pages])].sort((a, b) => a - b).reduce<(number | '…')[]>((acc, p) => {
        const last = acc[acc.length - 1];
        if (typeof last === 'number' && p - last > 1) acc.push('…');
        acc.push(p);
        return acc;
      }, []);

  const exportCsv = async () => {
    try {
      await saveText(`messages-${TODAY}.csv`, toCsv(rows));
      showToast(`Exported ${rows.length.toLocaleString()} messages`);
    } catch {
      showToast('Could not export');
    }
  };

  return (
    <Shell title="Messages" subtitle={`Delivery result for every patient message · ${counts.sent.toLocaleString()} total`}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: wide ? 'center' : 'stretch' }}>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search phone or patient" style={{ flex: wide ? 1 : undefined, maxWidth: wide ? 320 : undefined }} />
            {wide ? <View style={{ flex: 1 }} /> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                <T size={13} weight={font.medium}>{formatDate(TODAY)}</T>
              </View>
              <Button label="Export" icon="download" onPress={exportCsv} />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filters.map(([f, n]) => (
              <Chip key={f} label={`${f}  ${n.toLocaleString()}`} active={filter === f} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>
        </View>

        {slice.length ? <MessageTable rows={slice} /> : <Empty text="No messages match your search." />}

        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
          <T size={13} color={colors.muted}>
            {`Showing ${from.toLocaleString()}–${Math.min(cur * PAGE, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} messages`}
          </T>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Button label="Prev" disabled={cur <= 1} onPress={() => setPage(cur - 1)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
            {pageList.map((p, i) =>
              p === '…' ? <T key={`e${i}`} color={colors.muted}>…</T> : (
                <Button key={p} label={String(p)} kind={p === cur ? 'primary' : 'outline'} onPress={() => setPage(p)} style={{ paddingVertical: 6, paddingHorizontal: 12, minWidth: 36 }} />
              ),
            )}
            <Button label="Next" disabled={cur >= pages} onPress={() => setPage(cur + 1)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
          </View>
        </View>
      </Card>
    </Shell>
  );
}
