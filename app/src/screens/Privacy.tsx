import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { COMPANY, POLICY, POLICY_VERSION } from '../legal';
import { Icon, T } from '../components/ui';

/** The public privacy policy. Needs no sign-in, so it can be linked from Meta, Google and the login page. */
export default function Privacy({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 48 }}>
        <View style={{ width: '100%', maxWidth: 760, gap: 20 }}>
          <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 }} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="arrow-left" size={16} color={colors.primary} />
            <T size={14} weight={font.medium} color={colors.primary}>Back</T>
          </Pressable>

          <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 20 }}>
            <View style={{ gap: 6 }}>
              <T size={28} weight={font.bold}>Privacy Policy</T>
              <T size={13} color={colors.muted}>{COMPANY.product} · Version {POLICY_VERSION}</T>
            </View>
            {POLICY.map((s) => (
              <View key={s.title} style={{ gap: 8 }}>
                <T size={17} weight={font.semi}>{s.title}</T>
                {s.body.map((line, i) =>
                  line.startsWith('- ') ? (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
                      <T color={colors.muted}>•</T>
                      <T size={14} color="#33434c" style={{ flex: 1, lineHeight: 21 }}>{line.slice(2)}</T>
                    </View>
                  ) : (
                    <T key={i} size={14} color="#33434c" style={{ lineHeight: 21 }}>{line}</T>
                  ),
                )}
              </View>
            ))}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
