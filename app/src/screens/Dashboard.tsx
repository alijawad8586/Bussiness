import React from 'react';
import { View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { pct, nicename } from '../format';
import { Button, Card, CardHeading, Icon, IconName, T, useLayout } from '../components/ui';
import { BarChart, Donut, Legend } from '../components/Charts';
import { MessageTable } from '../components/MessageTable';
import { Shell } from '../components/Shell';
import { useCount, useLast7Days, useRecentOut, userCol } from '../hooks';
import { useStore } from '../store';

function Stat({ icon, bg, iconColor, label, value, note, noteColor }: {
  icon: IconName; bg: string; iconColor: string; label: string; value: string; note: string; noteColor: string;
}) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 150, paddingVertical: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={iconColor} />
        </View>
        <T size={14} weight={font.medium} color={colors.muted} style={{ flex: 1 }}>{label}</T>
      </View>
      <T size={30} weight={font.bold}>{value}</T>
      <T size={13} weight={font.medium} color={noteColor}>{note}</T>
    </Card>
  );
}

export default function Dashboard() {
  const { go, user, campaigns, lastSheet } = useStore();
  const { wide } = useLayout();
  const camp = campaigns[0];
  const patients = useCount(user ? () => userCol(user.uid, 'contacts') : null, `${lastSheet?.id}-${lastSheet?.created}`);
  const days = useLast7Days(`${camp?.id}-${camp?.stats.sent}`);
  const recent = useRecentOut(4);
  const n = (x: number) => x.toLocaleString();

  if (!camp) {
    return (
      <Shell title="Dashboard" subtitle="Your patient messaging at a glance">
        <Card style={{ alignItems: 'center', gap: 14, padding: 40 }}>
          <Icon name="send" size={36} color={colors.placeholder} />
          <T size={16} weight={font.semi}>No messages sent yet</T>
          <T color={colors.muted} style={{ textAlign: 'center' }}>Upload your patient sheet, choose an approved template and WhatsApp messages go out one by one.</T>
          <Button kind="primary" label="Go to Settings" icon="sliders" onPress={() => go({ name: 'settings' })} />
        </Card>
      </Shell>
    );
  }

  const s = camp.stats;
  const sent = camp.total - s.queued;
  const t = { delivered: s.delivered, failed: s.failed, notWa: s.notWhatsapp, pending: s.sent };

  return (
    <Shell title="Dashboard" subtitle={`${nicename(camp.template.name)} · latest campaign${camp.status !== 'completed' ? ` (${camp.status})` : ''}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Stat icon="users" bg={colors.blueBg} iconColor={colors.blue} label="Total patients" value={patients === null ? '…' : n(patients)} note={lastSheet ? `From ${lastSheet.fileName}` : 'Uploaded contacts'} noteColor={colors.blue} />
        <Stat icon="send" bg={colors.tint} iconColor={colors.primary} label="Messages sent" value={n(sent)} note={`${n(camp.total)} in this campaign`} noteColor={colors.primary} />
        <Stat icon="check-circle" bg={statusColors.Delivered.bg} iconColor={statusColors.Delivered.fg} label="Delivered" value={n(s.delivered)} note={`${pct(s.delivered, sent)} of sent`} noteColor={statusColors.Delivered.fg} />
        <Stat icon="x-circle" bg={statusColors.Failed.bg} iconColor={statusColors.Failed.fg} label="Failed" value={n(s.failed)} note={`${pct(s.failed, sent)} of sent`} noteColor={statusColors.Failed.fg} />
        <Stat icon="help-circle" bg={statusColors['Not on WhatsApp'].bg} iconColor={statusColors['Not on WhatsApp'].fg} label="Not on WhatsApp" value={n(s.notWhatsapp)} note={`${pct(s.notWhatsapp, sent)} of sent`} noteColor={statusColors['Not on WhatsApp'].fg} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ gap: 20, width: wide ? 440 : undefined }}>
          <CardHeading title="Delivery overview" sub="Status of all messages sent" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut totals={t} centerValue={n(sent)} centerLabel="messages sent" />
            <Legend totals={t} />
          </View>
        </Card>
        <Card style={{ flex: wide ? 1 : undefined, gap: 20 }}>
          <CardHeading title="Messages sent · last 7 days" sub="Daily sending volume" />
          {days.length ? <BarChart data={days} /> : <T color={colors.muted}>Loading…</T>}
        </Card>
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
          <T size={16} weight={font.semi}>Recent messages</T>
          <T size={13} weight={font.medium} color={colors.primary} onPress={() => go({ name: 'messages' })}>View all →</T>
        </View>
        {recent.length ? <MessageTable rows={recent} showMessage={false} /> : <T color={colors.muted} style={{ padding: 24 }}>No messages yet.</T>}
      </Card>
    </Shell>
  );
}
