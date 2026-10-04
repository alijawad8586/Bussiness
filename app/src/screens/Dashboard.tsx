import React from 'react';
import { View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { LAST_7_DAYS, MESSAGES, pct, summarize } from '../data';
import { Card, CardHeading, Icon, IconName, T, useLayout } from '../components/ui';
import { BarChart, Donut, Legend } from '../components/Charts';
import { MessageTable } from '../components/MessageTable';
import { Shell } from '../components/Shell';
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
  const { go, settings } = useStore();
  const { wide } = useLayout();
  const t = summarize(MESSAGES);
  const n = (x: number) => x.toLocaleString();

  return (
    <Shell title="Dashboard" subtitle="Appointment reminders · October 2026 campaign">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Stat icon="users" bg={colors.blueBg} iconColor={colors.blue} label="Total patients" value={n(settings.rows)} note={`From ${settings.fileName}`} noteColor={colors.blue} />
        <Stat icon="send" bg={colors.tint} iconColor={colors.primary} label="Messages sent" value={n(t.sent)} note={`${Math.round((t.sent / settings.rows) * 100)}% of patients`} noteColor={colors.primary} />
        <Stat icon="check-circle" bg={statusColors.Delivered.bg} iconColor={statusColors.Delivered.fg} label="Delivered" value={n(t.delivered)} note={`${pct(t.delivered, t.sent)} of sent`} noteColor={statusColors.Delivered.fg} />
        <Stat icon="x-circle" bg={statusColors.Failed.bg} iconColor={statusColors.Failed.fg} label="Failed" value={n(t.failed)} note={`${pct(t.failed, t.sent)} of sent`} noteColor={statusColors.Failed.fg} />
        <Stat icon="help-circle" bg={statusColors['Not on WhatsApp'].bg} iconColor={statusColors['Not on WhatsApp'].fg} label="Not on WhatsApp" value={n(t.notWa)} note={`${pct(t.notWa, t.sent)} of sent`} noteColor={statusColors['Not on WhatsApp'].fg} />
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
        <Card style={{ gap: 20, width: wide ? 440 : undefined }}>
          <CardHeading title="Delivery overview" sub="Status of all messages sent" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <Donut totals={t} centerValue={n(t.sent)} centerLabel="messages sent" />
            <Legend totals={t} />
          </View>
        </Card>
        <Card style={{ flex: wide ? 1 : undefined, gap: 20 }}>
          <CardHeading title="Messages sent · last 7 days" sub="Daily sending volume" />
          <BarChart data={LAST_7_DAYS} />
        </Card>
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
          <T size={16} weight={font.semi}>Recent messages</T>
          <T size={13} weight={font.medium} color={colors.primary} onPress={() => go({ name: 'messages' })}>View all →</T>
        </View>
        <MessageTable rows={MESSAGES.slice(0, 4).map((m, i) => ({ ...m, time: ['2 min ago', '2 min ago', '3 min ago', '3 min ago'][i] }))} showMessage={false} />
      </Card>
    </Shell>
  );
}
