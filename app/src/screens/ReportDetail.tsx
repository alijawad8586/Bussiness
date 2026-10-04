import React from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { buildDetail, deliveryRate, formatDate, pct } from '../data';
import { Button, Card, CardHeading, Icon, IconName, ProgressBar, SheetIcon, T, useLayout } from '../components/ui';
import { Donut, Legend, SplitBar, StackedBars } from '../components/Charts';
import { Shell } from '../components/Shell';
import { useStore } from '../store';
import { saveText } from './Messages';

const SHEET_URL = 'https://docs.google.com/spreadsheets';

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
  const { reports, go, showToast, settings } = useStore();
  const { wide } = useLayout();
  const r = reports.find((x) => x.id === id);

  if (!r) {
    return (
      <Shell title="Report not found">
        <Button label="Back to reports" icon="arrow-left" onPress={() => go({ name: 'reports' })} />
      </Shell>
    );
  }

  const d = buildDetail(r);
  const n = (x: number) => x.toLocaleString();
  const D = statusColors.Delivered, F = statusColors.Failed, W = statusColors['Not on WhatsApp'];
  const totals = { delivered: r.delivered, failed: r.failed, notWa: r.notWa };

  const exportPdf = async () => {
    if (Platform.OS === 'web') {
      window.print();
      return;
    }
    const lines = [
      `${r.name} · ${formatDate(r.date)}`,
      `Template: ${r.template}`,
      `Total sent: ${n(r.sent)}`,
      `Delivered: ${n(r.delivered)} (${pct(r.delivered, r.sent)})`,
      `Failed: ${n(r.failed)} (${pct(r.failed, r.sent)})`,
      `Not on WhatsApp: ${n(r.notWa)} (${pct(r.notWa, r.sent)})`,
    ];
    await saveText(`${r.template}-${r.date}.txt`, lines.join('\n'));
  };

  const openSheet = () => Linking.openURL(SHEET_URL).catch(() => showToast('Could not open Google Sheets'));

  return (
    <Shell title={`${r.name} · ${formatDate(r.date)}`} subtitle={`Template: ${r.template}  ·  Source: ${settings.fileName}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Pressable onPress={() => go({ name: 'reports' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button">
          <Icon name="arrow-left" size={16} color={colors.primary} />
          <T size={14} weight={font.medium} color={colors.primary}>Back to reports</T>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Open Google Sheet" icon="external-link" onPress={openSheet} />
          <Button kind="primary" label="Export PDF" icon="download" onPress={exportPdf} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Kpi icon="send" bg={colors.tint} color={colors.primary} label="Total sent" value={n(r.sent)} note="100% of sheet rows sent" />
        <Kpi icon="check-circle" bg={D.bg} color={D.fg} label="Delivered" value={n(r.delivered)} note={`${pct(r.delivered, r.sent)} of sent`} />
        <Kpi icon="x-circle" bg={F.bg} color={F.fg} label="Failed" value={n(r.failed)} note={`${pct(r.failed, r.sent)} of sent`} />
        <Kpi icon="help-circle" bg={W.bg} color={W.fg} label="Not on WhatsApp" value={n(r.notWa)} note={`${pct(r.notWa, r.sent)} of sent`} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ gap: 20, width: wide ? 420 : undefined }}>
          <CardHeading title="Delivery status split" sub={`Share of all ${n(r.sent)} messages`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut totals={totals} size={180} centerValue={`${deliveryRate(r).toFixed(1)}%`} centerLabel="delivered" />
            <Legend totals={totals} />
          </View>
        </Card>
        <Card style={{ flex: wide ? 1 : undefined, gap: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <CardHeading title="Sending performance" sub="Messages per 10-minute batch" />
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {([['Delivered', D], ['Failed', F], ['Not on WhatsApp', W]] as const).map(([l, c]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.dot }} />
                  <T size={12} weight={font.medium} color={colors.muted}>{l}</T>
                </View>
              ))}
            </View>
          </View>
          <StackedBars batches={d.batches} />
        </Card>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ flex: wide ? 1 : undefined, gap: 18 }}>
          <CardHeading title="Results by doctor" sub="Delivered, failed and non-WhatsApp numbers per doctor" />
          {d.doctors.map((x) => (
            <View key={x.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: wide ? 140 : 110, gap: 2 }}>
                <T size={13} weight={font.semi} numberOfLines={1}>{x.name}</T>
                <T size={11} color={colors.muted}>{`${n(x.sent)} sent · ${pct(x.delivered, x.sent)} delivered`}</T>
              </View>
              <SplitBar delivered={x.delivered} failed={x.failed} notWa={x.notWa} />
            </View>
          ))}
        </Card>
        <Card style={{ width: wide ? 420 : undefined, gap: 16 }}>
          <CardHeading title="Why messages failed" sub={`${n(r.failed)} failed messages by reason`} />
          {r.failed === 0 ? <T color={colors.muted}>No failed messages.</T> : d.reasons.map((x) => (
            <View key={x.label} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={13} weight={font.medium}>{x.label}</T>
                <T size={12} color={colors.muted}>{`${x.count}  ·  ${pct(x.count, r.failed)}`}</T>
              </View>
              <ProgressBar value={(x.count / r.failed) * 100} color={F.dot} />
            </View>
          ))}
        </Card>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingVertical: 18 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: D.bg, alignItems: 'center', justifyContent: 'center' }}>
          <SheetIcon color={D.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <T size={14} weight={font.semi}>Report data saved to Google Sheet</T>
          <T size={12} color={colors.muted}>{`Reports_Oct2026.gsheet · phone, patient, doctor, message and delivery status for all ${n(r.sent)} rows`}</T>
        </View>
        <Button label="Open sheet" icon="external-link" onPress={openSheet} />
      </Card>
    </Shell>
  );
}
