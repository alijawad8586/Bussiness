import React, { useState } from 'react';
import {
  Modal, Pressable, StyleProp, StyleSheet, Switch, Text, TextInput, TextInputProps, useWindowDimensions, View,
  ViewStyle, ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, Status, statusColors } from '../theme';
import { avatarColor, initials } from '../data';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, wide: width >= 900, xl: width >= 1280 };
}

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 18, color = colors.muted }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

export function Ticks({ read, size = 15 }: { read?: boolean; size?: number }) {
  return <MaterialCommunityIcons name="check-all" size={size} color={read ? '#53bdeb' : colors.placeholder} />;
}

export function SheetIcon({ size = 20, color = colors.primary }: { size?: number; color?: string }) {
  return <MaterialCommunityIcons name="google-spreadsheet" size={size} color={color} />;
}

/* ---------- Text helpers ---------- */

export function T({
  children, size = 14, color = colors.text, weight = font.regular, style, numberOfLines, onPress,
}: {
  children: React.ReactNode; size?: number; color?: string; weight?: '400' | '500' | '600' | '700';
  style?: StyleProp<any>; numberOfLines?: number; onPress?: () => void;
}) {
  return (
    <Text numberOfLines={numberOfLines} onPress={onPress} style={[{ fontSize: size, color, fontWeight: weight }, style]}>
      {children}
    </Text>
  );
}

/* ---------- Layout pieces ---------- */

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function CardHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <T size={16} weight={font.semi}>{title}</T>
      {sub ? <T size={13} color={colors.muted}>{sub}</T> : null}
    </View>
  );
}

/* ---------- Buttons ---------- */

export function Button({
  label, onPress, icon, kind = 'outline', style, disabled, flex,
}: {
  label: string; onPress?: () => void; icon?: IconName; kind?: 'primary' | 'outline'; style?: StyleProp<ViewStyle>;
  disabled?: boolean; flex?: boolean;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        primary ? s.btnPrimary : s.btnOutline,
        flex && { flex: 1 },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={primary ? '#fff' : colors.text} /> : null}
      <T size={14} weight={font.medium} color={primary ? '#fff' : colors.text}>{label}</T>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.primary }]}>
      <T size={12} weight={font.medium} color={active ? '#fff' : colors.muted}>{label}</T>
    </Pressable>
  );
}

/* ---------- Badges / avatars ---------- */

export function StatusBadge({ status }: { status: Status }) {
  const c = statusColors[status];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <View style={[s.dot, { backgroundColor: c.dot }]} />
      <T size={12} weight={font.medium} color={c.fg}>{status}</T>
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <T size={Math.round(size * 0.38)} weight={font.semi} color="#fff">{initials(name)}</T>
    </View>
  );
}

export function CountBadge({ n, size = 20 }: { n: number | string; size?: number }) {
  return (
    <View style={{ minWidth: size, height: size, borderRadius: size / 2, paddingHorizontal: 6, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
      <T size={11} weight={font.semi} color="#fff">{n}</T>
    </View>
  );
}

/* ---------- Inputs ---------- */

export function SearchBox({
  value, onChangeText, placeholder, style,
}: { value: string; onChangeText: (t: string) => void; placeholder: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.search, style]}>
      <Icon name="search" size={16} color={colors.placeholder} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={s.searchInput}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

export function Field({
  label, icon, error, ...props
}: { label: string; icon: IconName; error?: string } & TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <T size={13} weight={font.medium}>{label}</T>
      <View style={[s.input, focus && { borderColor: colors.primary }, !!error && { borderColor: '#ef4444' }]}>
        <Icon name={icon} size={18} color={colors.placeholder} />
        <TextInput
          {...props}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholderTextColor={colors.placeholder}
          style={s.inputText}
          accessibilityLabel={label}
        />
      </View>
      {error ? <T size={12} color="#b91c1c">{error}</T> : null}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: '#cfd6dc', true: colors.primary }}
      thumbColor="#fff"
    />
  );
}

/** Dropdown that opens a simple modal list. Works the same on web, iOS and Android. */
export function Select<V extends string>({
  value, options, onChange, height = 40, label, render, renderValue,
}: {
  value: V; options: { value: V; label: string; sub?: string }[]; onChange: (v: V) => void; height?: number;
  label?: string; render?: (o: { value: V; label: string; sub?: string }) => React.ReactNode;
  renderValue?: (o: { value: V; label: string; sub?: string }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={[s.select, { height }]}>
        <View style={{ flex: 1 }}>
          {current && renderValue ? renderValue(current) : <T size={13} weight={font.medium} numberOfLines={1}>{current?.label ?? value}</T>}
        </View>
        <Icon name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => { onChange(o.value); setOpen(false); }}
              style={[s.option, active && { backgroundColor: colors.tint }]}
            >
              <View style={[s.radio, active && { borderColor: colors.primary }]}>
                {active ? <View style={s.radioDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                {render ? render(o) : <T size={14} weight={font.semi}>{o.label}</T>}
                {o.sub ? <T size={12} color={colors.muted}>{o.sub}</T> : null}
              </View>
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

/** Centered dialog on wide screens, bottom sheet look on phones. */
export function Sheet({
  visible, onClose, title, children,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { wide, height } = useLayout();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.backdrop, !wide && { justifyContent: 'flex-end', padding: 0 }]} onPress={onClose}>
        <Pressable
          style={[s.sheet, wide ? { width: 420, borderRadius: 14 } : { width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }, { maxHeight: height * 0.8 }]}
          onPress={() => {}}
        >
          <View style={s.sheetHead}>
            <T size={16} weight={font.semi}>{title ?? ''}</T>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <Icon name="x" size={20} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 10, gap: 4 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProgressBar({ value, color = colors.green, width }: { value: number; color?: string; width?: number }) {
  return (
    <View style={[s.track, width ? { width } : { flex: 1 }]}>
      <View style={{ height: 6, borderRadius: 3, width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <T color={colors.muted}>{text}</T>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.bg },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, height: '100%', ...({ outlineStyle: 'none' } as object) },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  inputText: { flex: 1, fontSize: 14, color: colors.text, height: '100%', ...({ outlineStyle: 'none' } as object) },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,27,33,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: '#fff', overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
});
