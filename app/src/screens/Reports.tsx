import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { Report, TODAY, deliveryRate, formatDate } from '../data';
import { Button, Card, Chip, Empty, Icon, ProgressBar, SearchBox, T, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { useStore } from '../store';

type Range = 'All reports' | 'This month' | 'Last 3 months';

function inRange(r: Report, range: Range) {
  if (range === 'All reports') return true;
  if (range === 'This month') return r.date.slice(0, 7) === TODAY.slice(0, 7);
  const d = new Date(TODAY);
  d.setMonth(d.getMonth() - 3);
  return r.date >= d.toISOString().slice(0, 10);
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

export default function Reports() {
  const { reports, go, generateReport, showToast } = useStore();
  const { wide } = useLayout();
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('All reports');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => inRange(r, range) && (!q || r.name.toLowerCase().includes(q) || r.template.includes(q)));
  }, [reports, query, range]);

  const totalSent = reports.reduce((a, r) => a + r.sent, 0);
  const avg = reports.length ? reports.reduce((a, r) => a + deliveryRate(r), 0) / reports.length : 0;
  const best = reports.reduce<Report | null>((b, r) => (!b || deliveryRate(r) > deliveryRate(b) ? r : b), null);

  const generate = () => {
    const r = generateReport();
    showToast(`Report generated: ${r.name}`);
    go({ name: 'report', id: r.id });
  };

  return (
    <Shell title="Reports" subtitle="Open a report to see detailed delivery analysis">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Summary icon="file-text" bg={colors.blueBg} color={colors.blue} label="Reports generated" value={String(reports.length)} note="Last 30 days" />
        <Summary icon="send" bg={colors.tint} color={colors.primary} label="Messages sent" value={totalSent.toLocaleString()} note="Across all reports" />
        <Summary icon="check-circle" bg={statusColors.Delivered.bg} color={statusColors.Delivered.fg} label="Average delivery rate" value={`${avg.toFixed(1)}%`} note={best ? `Best: ${deliveryRate(best).toFixed(1)}% (${best.name})` : '—'} />
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: wide ? 'center' : 'stretch' }}>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search reports" style={{ flex: wide ? 1 : undefined, maxWidth: wide ? 320 : undefined }} />
            {wide ? <View style={{ flex: 1 }} /> : null}
            <Button kind="primary" label="Generate report" icon="plus" onPress={generate} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['All reports', 'This month', 'Last 3 months'] as Range[]).map((r) => (
              <Chip key={r} label={r} active={range === r} onPress={() => setRange(r)} />
            ))}
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

        {list.length ? list.map((r, i) => {
          const rate = deliveryRate(r);
          const latest = i === 0 && range === 'All reports' && !query;
          return (
            <Pressable
              key={r.id}
              onPress={() => go({ name: 'report', id: r.id })}
              style={({ pressed }) => ({ padding: wide ? undefined : 16, paddingHorizontal: wide ? 24 : 16, paddingVertical: 14, borderTopWidth: wide && i === 0 ? 0 : 1, borderTopColor: colors.border, backgroundColor: pressed ? colors.bg : '#fff' })}
            >
              {wide ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 2.4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}><Icon name="bar-chart-2" size={18} color={colors.primary} /></View>
                    <View style={{ gap: 2, flexShrink: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <T size={14} weight={font.semi} numberOfLines={1}>{r.name}</T>
                        {latest ? <View style={{ backgroundColor: colors.tint, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11} weight={font.semi} color={colors.primary}>Latest</T></View> : null}
                      </View>
                      <T size={12} color={colors.muted}>Auto-sent · {formatDate(r.date)}</T>
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}><T size={13} color={colors.muted}>{formatDate(r.date)}</T></View>
                  <View style={{ flex: 1.6 }}><T size={13} color={colors.muted} numberOfLines={1}>{r.template}</T></View>
                  <View style={{ flex: 0.8 }}><T size={13} weight={font.medium}>{r.sent.toLocaleString()}</T></View>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ProgressBar value={rate} />
                    <T size={13} weight={font.semi} style={{ width: 48 }}>{rate.toFixed(1)}%</T>
                  </View>
                  <View style={{ flex: 1.2 }}><T size={13} color={colors.muted}>{r.source}</T></View>
                  <Icon name="chevron-right" size={20} color={colors.placeholder} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <T size={15} weight={font.semi}>{r.name}</T>
                    <Icon name="chevron-right" size={20} color={colors.placeholder} />
                  </View>
                  <T size={12} color={colors.muted}>{formatDate(r.date)} · {r.template} · {r.sent.toLocaleString()} sent</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ProgressBar value={rate} />
                    <T size={13} weight={font.semi}>{rate.toFixed(1)}%</T>
                  </View>
                </View>
              )}
            </Pressable>
          );
        }) : <Empty text="No reports found." />}
      </Card>
    </Shell>
  );
}
