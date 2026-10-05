import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, font, Status, statusColors } from '../theme';
import { pct } from '../format';
import { T } from './ui';

interface Totals { delivered: number; failed: number; notWa: number; pending?: number }

const SLICES: { key: 'delivered' | 'failed' | 'notWa' | 'pending'; status: Status }[] = [
  { key: 'delivered', status: 'Delivered' },
  { key: 'failed', status: 'Failed' },
  { key: 'notWa', status: 'Not on WhatsApp' },
  { key: 'pending', status: 'Sent' },
];
const val = (t: Totals, k: 'delivered' | 'failed' | 'notWa' | 'pending') => t[k] ?? 0;

export function Donut({ totals, size = 176, centerValue, centerLabel }: {
  totals: Totals; size?: number; centerValue: string; centerLabel: string;
}) {
  const total = SLICES.reduce((a, x) => a + val(totals, x.key), 0) || 1;
  const stroke = size * 0.18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        {SLICES.map(({ key, status }) => {
          const len = (val(totals, key) / total) * c;
          const el = (
            <Circle
              key={key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={statusColors[status].dot}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          offset += len;
          return el;
        })}
      </Svg>
      <T size={size > 170 ? 26 : 22} weight={font.bold}>{centerValue}</T>
      <T size={12} color={colors.muted}>{centerLabel}</T>
    </View>
  );
}

export function Legend({ totals }: { totals: Totals }) {
  const total = SLICES.reduce((a, x) => a + val(totals, x.key), 0);
  return (
    <View style={{ gap: 14 }}>
      {SLICES.filter((x) => x.key !== 'pending' || val(totals, 'pending') > 0).map(({ key, status }) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColors[status].dot }} />
          <View style={{ gap: 1 }}>
            <T size={13} weight={font.medium}>{status === 'Sent' ? 'Waiting for delivery' : status}</T>
            <T size={12} color={colors.muted}>{`${val(totals, key).toLocaleString()}  ·  ${pct(val(totals, key), total)}`}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Simple vertical bar chart. Bars scale to the largest value. */
export function BarChart({ data, height = 190 }: { data: [string, number][]; height?: number }) {
  const max = Math.max(...data.map((d) => d[1]), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
      {data.map(([label, v]) => (
        <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <T size={12} weight={font.medium} color={colors.muted}>{v}</T>
          <View style={{ width: '100%', maxWidth: 44, height: Math.max(4, (v / max) * height), backgroundColor: colors.green, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
          <T size={12} color={colors.muted}>{label}</T>
        </View>
      ))}
    </View>
  );
}

export function StackedBars({ batches, height = 160 }: {
  batches: { label: string; total: number; delivered: number; failed: number; notWa: number }[]; height?: number;
}) {
  const max = Math.max(...batches.map((b) => b.total), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
      {batches.map((b) => {
        const h = (b.total / max) * height;
        const part = (n: number) => (b.total ? (n / b.total) * h : 0);
        return (
          <View key={b.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <T size={12} weight={font.medium} color={colors.muted}>{b.total}</T>
            <View style={{ width: '100%', maxWidth: 56, borderRadius: 6, overflow: 'hidden' }}>
              <View style={{ height: part(b.notWa), backgroundColor: statusColors['Not on WhatsApp'].dot }} />
              <View style={{ height: part(b.failed), backgroundColor: statusColors.Failed.dot }} />
              <View style={{ height: part(b.delivered), backgroundColor: statusColors.Delivered.dot }} />
            </View>
            <T size={12} color={colors.muted}>{b.label}</T>
          </View>
        );
      })}
    </View>
  );
}

export function SplitBar({ delivered, failed, notWa, total: all }: Totals & { total: number }) {
  const total = all || 1;
  return (
    <View style={{ flex: 1, height: 22, flexDirection: 'row', borderRadius: 6, overflow: 'hidden', backgroundColor: colors.track }}>
      <View style={{ flex: delivered / total, backgroundColor: statusColors.Delivered.dot }} />
      <View style={{ flex: failed / total, backgroundColor: statusColors.Failed.dot }} />
      <View style={{ flex: notWa / total, backgroundColor: statusColors['Not on WhatsApp'].dot }} />
      <View style={{ flex: Math.max(0, total - delivered - failed - notWa) / total, backgroundColor: colors.track }} />
    </View>
  );
}
