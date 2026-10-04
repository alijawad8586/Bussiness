import React from 'react';
import { View } from 'react-native';
import { colors, font } from '../theme';
import { Msg } from '../data';
import { StatusBadge, T, useLayout } from './ui';

const COLS = [
  { key: 'phone', label: 'Phone number', flex: 1.3 },
  { key: 'patient', label: 'Patient name', flex: 1.4 },
  { key: 'doctor', label: 'Doctor', flex: 1.4 },
  { key: 'text', label: 'Message', flex: 3 },
  { key: 'status', label: 'Status', flex: 1.5 },
  { key: 'time', label: 'Time', flex: 0.9 },
] as const;

/** Table on wide screens, stacked cards on phones. */
export function MessageTable({ rows, showMessage = true }: { rows: Msg[]; showMessage?: boolean }) {
  const { wide } = useLayout();
  const cols = COLS.filter((c) => showMessage || c.key !== 'text');

  if (!wide) {
    return (
      <View>
        {rows.map((m) => (
          <View key={m.id} style={{ padding: 16, gap: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <T weight={font.semi} style={{ flex: 1 }} numberOfLines={1}>{m.patient}</T>
              <StatusBadge status={m.status} />
            </View>
            <T size={13} color={colors.muted}>{m.phone}  ·  {m.doctor}</T>
            {showMessage ? <T size={13} color={colors.muted} numberOfLines={2}>{m.text}</T> : null}
            <T size={12} color={colors.placeholder}>{m.time}</T>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', backgroundColor: colors.tableHead, paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, gap: 12 }}>
        {cols.map((c) => (
          <View key={c.key} style={{ flex: c.flex }}><T size={12} weight={font.semi} color={colors.muted}>{c.label}</T></View>
        ))}
      </View>
      {rows.map((m, i) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, gap: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
          {cols.map((c) => (
            <View key={c.key} style={{ flex: c.flex }}>
              {c.key === 'status' ? <StatusBadge status={m.status} /> : (
                <T size={13} weight={c.key === 'patient' ? font.medium : font.regular} color={c.key === 'phone' || c.key === 'patient' ? colors.text : colors.muted} numberOfLines={1}>
                  {m[c.key]}
                </T>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
