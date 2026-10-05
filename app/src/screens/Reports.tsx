import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { formatDate, nicename } from '../format';
import { Card, Chip, Empty, Icon, ProgressBar, SearchBox, T, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { Campaign } from '../types';
import { useStore } from '../store';

type Range = 'All reports' | 'This month' | 'Last 3 months';

const sentOf = (c: Campaign) => c.total - c.stats.queued;
const rateOf = (c: Campaign) => (sentOf(c) ? (c.stats.delivered / sentOf(c)) * 100 : 0);

function inRange(c: Campaign, range: Range) {
  if (range === 'All reports') return true;
  const d = new Date();
  if (range === 'This month') return new Date(c.createdAt).getMonth() === d.getMonth() && new Date(c.createdAt).getFullYear() === d.getFullYear();
  d.setMonth(d.getMonth() - 3);
  return c.createdAt >= d.getTime();
}

function Summary({ icon, bg, color, label, value, note }: { icon: any; bg: string; color: string; label: string; value: string; note: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 220, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <View style={{ gap: 3, flex: 1 }}>
        <T size={13} weight={font.medium} color={colors.muted}>{label}</T>
        <T size={26} weight={font.bold}>{value}</T>
        <T size={12} weight={font.medium} color={color}>{note}</T>
      </View>
    </Card>
  );
}

const STATE: Record<string, { label: string; color: string }> = {
  queued: { label: 'Queued', color: colors.muted },
  running: { label: 'Sending…', color: colors.blue },
  paused: { label: 'Paused', color: colors.danger },
  completed: { label: '', color: colors.muted },
};

export default function Reports() {
  const { campaigns, go } = useStore();
  const { wide } = useLayout();
  const [q, setQ] = useState('');
  const [range, setRange] = useState<Range>('All reports');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return campaigns.filter((c) => inRange(c, range) && (!s || c.template.name.toLowerCase().includes(s) || c.sheetName.toLowerCase().includes(s)));
  }, [campaigns, q, range]);

  const totalSent = campaigns.reduce((a, c) => a + sentOf(c), 0);
  const avg = campaigns.length ? campaigns.reduce((a, c) => a + rateOf(c), 0) / campaigns.length : 0;
  const best = campaigns.reduce<Campaign | null>((b, c) => (!b || rateOf(c) > rateOf(b) ? c : b), null);

  return (
    <Shell title="Reports">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Summary icon="file-text" bg={colors.blueBg} color={colors.blue} label="Reports generated" value={String(campaigns.length)} note="Every upload that sent messages" />
        <Summary icon="send" bg={colors.tint} color={colors.primary} label="Messages sent" value={totalSent.toLocaleString()} note="Across all reports" />
        <Summary icon="check-circle" bg={statusColors.Delivered.bg} color={statusColors.Delivered.fg} label="Average delivery rate" value={`${avg.toFixed(1)}%`} note={best ? `Best: ${rateOf(best).toFixed(1)}% (${nicename(best.template.name)})` : '—'} />
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <SearchBox value={q} onChangeText={setQ} placeholder="Search reports" style={{ maxWidth: wide ? 320 : undefined }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['All reports', 'This month', 'Last 3 months'] as Range[]).map((r) => <Chip key={r} label={r} active={range === r} onPress={() => setRange(r)} />)}
          </ScrollView>
        </View>

        {wide && list.length ? (
          <View style={{ flexDirection: 'row', backgroundColor: colors.tableHead, paddingHorizontal: 24, paddingVertical: 12, gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
            {[['Report', 2.4], ['Date', 1.2], ['Template', 1.6], ['Sent', 0.8], ['Delivery rate', 2], ['Source', 1.2]].map(([l, f]) => (
              <View key={l as string} style={{ flex: f as number }}><T size={12} weight={font.semi} color={colors.muted}>{l as string}</T></View>
            ))}
            <View style={{ width: 20 }} />
          </View>
        ) : null}

        {list.length ? list.map((c, i) => {
          const rate = rateOf(c);
          const st = STATE[c.status];
          return (
            <Pressable key={c.id} onPress={() => go({ name: 'report', id: c.id })}
              style={({ pressed }) => ({ paddingHorizontal: wide ? 24 : 16, paddingVertical: 14, borderTopWidth: wide && i === 0 ? 0 : 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : '#fff' })}>
              {wide ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}><Icon name="bar-chart-2" size={18} color={colors.primary} /></View>
                    <View style={{ gap: 2, flexShrink: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <T size={14} weight={font.semi} numberOfLines={1}>{nicename(c.template.name)}</T>
                        {i === 0 ? <View style={{ backgroundColor: colors.tint, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11} weight={font.semi} color={colors.primary}>Latest</T></View> : null}
                        {st.label ? <T size={11} weight={font.semi} color={st.color}>{st.label}</T> : null}
                      </View>
                      <T size={12} color={colors.muted}>{c.total.toLocaleString()} patients</T>
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}><T size={13} color={colors.muted}>{formatDate(c.createdAt)}</T></View>
                  <View style={{ flex: 1.6 }}><T size={13} color={colors.muted} numberOfLines={1}>{c.template.name}</T></View>
                  <View style={{ flex: 0.8 }}><T size={13} weight={font.medium}>{sentOf(c).toLocaleString()}</T></View>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ProgressBar value={rate} />
                    <T size={13} weight={font.semi} style={{ width: 48 }}>{rate.toFixed(1)}%</T>
                  </View>
                  <View style={{ flex: 1.2 }}><T size={13} color={colors.muted} numberOfLines={1}>{c.sheetName}</T></View>
                  <Icon name="chevron-right" size={20} color={colors.placeholder} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <T size={15} weight={font.semi}>{nicename(c.template.name)}{st.label ? `  ·  ${st.label}` : ''}</T>
                    <Icon name="chevron-right" size={20} color={colors.placeholder} />
                  </View>
                  <T size={12} color={colors.muted}>{formatDate(c.createdAt)} · {c.sheetName} · {sentOf(c).toLocaleString()} sent</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ProgressBar value={rate} />
                    <T size={13} weight={font.semi}>{rate.toFixed(1)}%</T>
                  </View>
                </View>
              )}
            </Pressable>
          );
        }) : <Empty text="No reports yet. Upload a sheet in Settings to send your first campaign." />}
      </Card>
    </Shell>
  );
}
