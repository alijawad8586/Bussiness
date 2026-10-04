import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { Icon, T, useLayout } from './ui';

const FEATURES = [
  'Send approved templates straight from your patient sheet',
  'Track delivered, failed and non-WhatsApp numbers',
  'Clear reports with charts your clinic staff can use',
];

/** Two-panel page (brand + form) on wide screens, stacked on phones. Used by sign-in and API setup. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { wide } = useLayout();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: wide ? '#fff' : colors.dark }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, flexDirection: wide ? 'row' : 'column' }} keyboardShouldPersistTaps="handled">
          <View style={[s.brand, wide ? { width: '45%', padding: 64, justifyContent: 'space-between' } : { padding: 24, gap: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.logo}><Icon name="message-circle" size={24} color="#fff" /></View>
              <T size={22} weight={font.bold} color="#fff">CareReach</T>
            </View>
            <View style={{ gap: wide ? 28 : 12 }}>
              <T size={wide ? 38 : 24} weight={font.bold} color="#fff" style={{ lineHeight: wide ? 48 : 32 }}>
                Reach every patient on WhatsApp, and know exactly what was delivered.
              </T>
              {wide ? (
                <View style={{ gap: 16 }}>
                  {FEATURES.map((f) => (
                    <View key={f} style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={s.tick}><Icon name="check" size={14} color="#fff" /></View>
                      <T size={16} color="#d1f0ea" style={{ flex: 1 }}>{f}</T>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {wide ? <T size={13} color="#8fd3c7">Built on the WhatsApp Business Platform</T> : null}
          </View>
          <View style={[s.panel, !wide && s.panelMobile]}>
            <View style={{ width: '100%', maxWidth: 440, gap: 22 }}>
              <View style={{ gap: 8 }}>
                <T size={wide ? 28 : 24} weight={font.bold}>{title}</T>
                {subtitle ? <T size={15} color={colors.muted} style={{ lineHeight: 22 }}>{subtitle}</T> : null}
              </View>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  brand: { backgroundColor: colors.dark },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  panel: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panelMobile: { borderTopLeftRadius: 20, borderTopRightRadius: 20, justifyContent: 'flex-start', paddingTop: 28 },
});
