import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { colors, font, statusColors } from '../theme';
import { api } from '../api';
import { formatDate, formatTime, nicename, pct } from '../format';
import { messagesToCsv, saveText } from '../files';
import { messageOf, userCol } from '../hooks';
import { Button, Card, CardHeading, Icon, IconName, ProgressBar, T, useLayout } from '../components/ui';
import { Donut, Legend, SplitBar, StackedBars } from '../components/Charts';
import { Shell } from '../components/Shell';
import { Message } from '../types';
import { useStore } from '../store';

function Kpi({ icon, bg, color, label, value, note }: { icon: IconName; bg: string; color: string; label: string; value: string; note: string }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 200, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <View style={{ gap: 3 }}>
        <T size={13} weight={font.medium} color={colors.muted}>{label}</T>
        <T size={26} weight={font.bold}>{value}</T>
        <T size={12} weight={font.medium} color={color}>{note}</T>
      </View>
    </Card>
  );
}

export default function ReportDetail({ id }: { id: string }) {
  const { campaigns, go, showToast, user } = useStore();
  const { wide } = useLayout();
  const [busy, setBusy] = useState(false);
  const c = campaigns.find((x) => x.id === id);

  if (!c) {
    return (
      <Shell title="Report not found">
        <Button label="Back to reports" icon="arrow-left" onPress={() => go({ name: 'reports' })} />
      </Shell>
    );
  }

  const n = (x: number) => x.toLocaleString();
  const D = statusColors.Delivered, F = statusColors.Failed, W = statusColors['Not on WhatsApp'];
  const s = c.stats;
  const sent = c.total - s.queued;
  const totals = { delivered: s.delivered, failed: s.failed, notWa: s.notWhatsapp, pending: s.sent };
  const rate = sent ? (s.delivered / sent) * 100 : 0;

  const doctors = Object.entries(c.byDoctor).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  const reasons = Object.values(c.failReasons).sort((a, b) => b.count - a.count);
  const batches = Object.entries(c.timeline)
    .map(([k, v]) => ({ at: Number(k.slice(1)) * 600_000, delivered: v.delivered ?? 0, failed: v.failed ?? 0, notWa: v.notWhatsapp ?? 0 }))
    .sort((a, b) => a.at - b.at).slice(-8)
    .map((b) => ({ label: formatTime(b.at), total: b.delivered + b.failed + b.notWa, delivered: b.delivered, failed: b.failed, notWa: b.notWa }));

  const act = async (action: 'pause' | 'resume' | 'retryFailed') => {
    setBusy(true);
    try {
      const r = await api.campaignAction({ campaignId: c.id, action });
      showToast(action === 'pause' ? 'Sending paused' : `${r.count} message${r.count === 1 ? '' : 's'} back in the queue`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not do that');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (!user) return;
    try {
      const all: Message[] = [];
      let last: QueryDocumentSnapshot | undefined;
      while (all.length < 5000) {
        const q = query(userCol(user.uid, 'messages'), where('campaignId', '==', c.id), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(500));
        const docs = (await getDocs(q)).docs;
        all.push(...docs.map((d) => messageOf(d.id, d.data())));
        if (docs.length < 500) break;
        last = docs[docs.length - 1];
      }
      await saveText(`${c.template.name}-${new Date(c.createdAt).toISOString().slice(0, 10)}.csv`, messagesToCsv(all));
      showToast(`Exported ${all.length.toLocaleString()} messages`);
    } catch {
      showToast('Could not export (a database index may be missing)');
    }
  };

  const running = c.status === 'running' || c.status === 'queued';

  return (
    <Shell title={`${nicename(c.template.name)} · ${formatDate(c.createdAt)}`} subtitle={`Template: ${c.template.name}  ·  Source: ${c.sheetName}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Pressable onPress={() => go({ name: 'reports' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button">
          <Icon name="arrow-left" size={16} color={colors.primary} />
          <T size={14} weight={font.medium} color={colors.primary}>Back to reports</T>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {running ? <Button label="Pause" icon="pause" onPress={() => act('pause')} disabled={busy} /> : null}
          {c.status === 'paused' ? <Button kind="primary" label="Resume" icon="play" onPress={() => act('resume')} disabled={busy} /> : null}
          {s.failed > 0 ? <Button label={`Retry ${n(s.failed)} failed`} icon="refresh-cw" onPress={() => act('retryFailed')} disabled={busy} /> : null}
          <Button kind="primary" label="Export CSV" icon="download" onPress={exportCsv} />
        </View>
      </View>

      {c.status === 'paused' && c.error ? (
        <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 14, gap: 4 }}>
          <T weight={font.semi} color={colors.danger}>Sending is paused</T>
          <T size={13} color={colors.danger}>{c.error}</T>
        </View>
      ) : null}
      {running ? (
        <Card style={{ gap: 8, paddingVertical: 14 }}>
          <T size={13} weight={font.medium}>Sending… {n(sent)} of {n(c.total)} done</T>
          <ProgressBar value={c.total ? (sent / c.total) * 100 : 0} color={colors.primary} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi icon="send" bg={colors.tint} color={colors.primary} label="Total sent" value={n(sent)} note={`of ${n(c.total)} contacts${c.optOutSkipped ? ` · ${c.optOutSkipped} opted out` : ''}`} />
        <Kpi icon="check-circle" bg={D.bg} color={D.fg} label="Delivered" value={n(s.delivered)} note={`${pct(s.delivered, sent)} of sent`} />
        <Kpi icon="x-circle" bg={F.bg} color={F.fg} label="Failed" value={n(s.failed)} note={`${pct(s.failed, sent)} of sent`} />
        <Kpi icon="help-circle" bg={W.bg} color={W.fg} label="Not on WhatsApp" value={n(s.notWhatsapp)} note={`${pct(s.notWhatsapp, sent)} of sent`} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ gap: 20, width: wide ? 420 : undefined }}>
          <CardHeading title="Delivery status split" sub={`Share of ${n(sent)} sent messages`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut totals={totals} size={180} centerValue={`${rate.toFixed(1)}%`} centerLabel="delivered" />
            <Legend totals={totals} />
          </View>
        </Card>
        <Card style={{ flex: wide ? 1 : undefined, gap: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <CardHeading title="Sending performance" sub="Final results per 10-minute batch" />
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {([['Delivered', D], ['Failed', F], ['Not on WhatsApp', W]] as const).map(([l, col]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col.dot }} />
                  <T size={12} weight={font.medium} color={colors.muted}>{l}</T>
                </View>
              ))}
            </View>
          </View>
          {batches.length ? <StackedBars batches={batches} /> : <T color={colors.muted}>Results appear here as messages are delivered.</T>}
        </Card>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ flex: wide ? 1 : undefined, gap: 18 }}>
          <CardHeading title="Results by doctor" sub="Delivered, failed and non-WhatsApp numbers per doctor" />
          {doctors.map((x) => (
            <View key={x.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: wide ? 160 : 110, gap: 2 }}>
                <T size={13} weight={font.semi} numberOfLines={1}>{x.name}</T>
                <T size={11} color={colors.muted}>{`${n(x.total)} patients · ${pct(x.delivered, x.total)} delivered`}</T>
              </View>
              <SplitBar delivered={x.delivered} failed={x.failed} notWa={x.notWhatsapp} total={x.total} />
            </View>
          ))}
        </Card>
        <Card style={{ width: wide ? 420 : undefined, gap: 16 }}>
          <CardHeading title="Why messages failed" sub={`${n(s.failed + s.notWhatsapp)} messages by reason`} />
          {reasons.length === 0 ? <T color={colors.muted}>No failed messages.</T> : reasons.map((x) => (
            <View key={x.label} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <T size={13} weight={font.medium} style={{ flex: 1 }}>{x.label}</T>
                <T size={12} color={colors.muted}>{`${x.count}  ·  ${pct(x.count, s.failed + s.notWhatsapp)}`}</T>
              </View>
              <ProgressBar value={(x.count / Math.max(1, s.failed + s.notWhatsapp)) * 100} color={F.dot} />
            </View>
          ))}
        </Card>
      </View>
    </Shell>
  );
}
