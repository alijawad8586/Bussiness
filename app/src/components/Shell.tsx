import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { Route, useStore } from '../store';
import { CountBadge, Icon, IconName, T, useLayout } from './ui';

type Tab = 'dashboard' | 'inbox' | 'messages' | 'reports' | 'settings';

const NAV: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'inbox', label: 'WhatsApp Inbox', icon: 'message-circle' },
  { key: 'messages', label: 'Messages', icon: 'list' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-2' },
  { key: 'settings', label: 'Settings', icon: 'sliders' },
];

const SHORT: Record<Tab, string> = { dashboard: 'Home', inbox: 'Inbox', messages: 'Messages', reports: 'Reports', settings: 'Settings' };

export function tabOf(r: Route): Tab {
  return r.name === 'report' ? 'reports' : r.name;
}

function Logo({ small }: { small?: boolean }) {
  const s = small ? 32 : 36;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: s, height: s, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="message-circle" size={s * 0.55} color="#fff" />
      </View>
      <View>
        <T size={17} weight={font.bold}>CareReach</T>
        {!small && <T size={12} color={colors.muted}>Patient messaging</T>}
      </View>
    </View>
  );
}

function ProductChip() {
  const { creds } = useStore();
  return (
    <View style={s.chip}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} />
      <T size={13} weight={font.medium} color={colors.dark}>Product ID: {creds?.productId}</T>
    </View>
  );
}

function Sidebar() {
  const { route, go, unreadCount, creds, disconnect } = useStore();
  const active = tabOf(route);
  return (
    <View style={s.sidebar}>
      <View style={{ paddingBottom: 20, paddingLeft: 4 }}><Logo /></View>
      {NAV.map((n) => {
        const on = n.key === active;
        return (
          <Pressable key={n.key} onPress={() => go({ name: n.key } as Route)} style={[s.navItem, on && { backgroundColor: colors.tint }]}>
            <Icon name={n.icon} size={20} color={on ? colors.primary : colors.muted} />
            <T size={14} weight={on ? font.semi : font.medium} color={on ? colors.primary : colors.text} style={{ flex: 1 }}>{n.label}</T>
            {n.key === 'inbox' && unreadCount > 0 ? <CountBadge n={unreadCount} size={20} /> : null}
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable onPress={disconnect} style={s.apiBox} accessibilityLabel="Disconnect WhatsApp API">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} />
          <T size={13} weight={font.medium}>WhatsApp API connected</T>
        </View>
        <T size={12} color={colors.muted}>Product ID · {creds?.productId}</T>
        <T size={11} color={colors.primary} weight={font.medium}>Tap to disconnect</T>
      </Pressable>
    </View>
  );
}

function BottomNav() {
  const { route, go, unreadCount } = useStore();
  const active = tabOf(route);
  return (
    <SafeAreaView edges={['bottom']} style={s.bottom}>
      <View style={{ flexDirection: 'row' }}>
        {NAV.map((n) => {
          const on = n.key === active;
          return (
            <Pressable key={n.key} onPress={() => go({ name: n.key } as Route)} style={s.tab} accessibilityRole="tab">
              <View>
                <Icon name={n.icon} size={22} color={on ? colors.primary : colors.muted} />
                {n.key === 'inbox' && unreadCount > 0 ? (
                  <View style={s.tabBadge}><T size={9} weight={font.semi} color="#fff">{unreadCount}</T></View>
                ) : null}
              </View>
              <T size={11} weight={on ? font.semi : font.medium} color={on ? colors.primary : colors.muted}>{SHORT[n.key]}</T>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

/** Page frame: sidebar on wide screens, bottom tabs on phones. */
export function Shell({
  title, subtitle, children, scroll = true,
}: { title: string; subtitle?: string; children: React.ReactNode; scroll?: boolean }) {
  const { wide } = useLayout();
  const { creds } = useStore();
  const header = (
    <View style={[s.top, !wide && { marginBottom: 4 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <T size={wide ? 26 : 22} weight={font.bold} numberOfLines={2}>{title}</T>
        {subtitle ? <T size={14} color={colors.muted}>{subtitle}</T> : null}
      </View>
      {wide ? <ProductChip /> : null}
      <View style={s.avatar}><T size={14} weight={font.semi} color="#fff">CA</T></View>
    </View>
  );
  const body = (
    <View style={{ gap: 20, padding: wide ? 32 : 16, paddingTop: wide ? 28 : 12, flex: scroll ? undefined : 1 }}>
      {header}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={wide ? [] : ['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? <Sidebar /> : null}
        <View style={{ flex: 1 }}>
          {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
        </View>
      </View>
      {!wide ? <BottomNav /> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  sidebar: { width: 240, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: colors.border, paddingTop: 24, paddingBottom: 20, paddingHorizontal: 16, gap: 6 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8 },
  apiBox: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.tint },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  bottom: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8 },
  tabBadge: { position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
});
