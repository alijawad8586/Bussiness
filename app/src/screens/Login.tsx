import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { Button, Field, Icon, T, useLayout } from '../components/ui';
import { useStore } from '../store';

const FEATURES = [
  'Send approved templates straight from your patient sheet',
  'Track delivered, failed and non-WhatsApp numbers',
  'Clear reports with charts your clinic staff can use',
];

export default function Login() {
  const { connect } = useStore();
  const { wide } = useLayout();
  const [productId, setProductId] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!productId.trim()) e.productId = 'Enter your Product ID';
    if (!/^\d{5,}$/.test(phoneId.trim())) e.phoneId = 'Phone number ID should be digits only (at least 5)';
    if (token.trim().length < 10) e.token = 'Access token looks too short';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    // Front-end only: a real build would verify the credentials with the WhatsApp Business API here.
    setTimeout(() => {
      setLoading(false);
      connect({ productId: productId.trim().toUpperCase(), phoneId: phoneId.trim(), token: token.trim() });
    }, 700);
  };

  const brand = (
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
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: wide ? '#fff' : colors.dark }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, flexDirection: wide ? 'row' : 'column' }} keyboardShouldPersistTaps="handled">
          {brand}
          <View style={[s.panel, !wide && s.panelMobile]}>
            <View style={{ width: '100%', maxWidth: 440, gap: 22 }}>
              <View style={{ gap: 8 }}>
                <T size={wide ? 28 : 24} weight={font.bold}>Connect your WhatsApp API</T>
                <T size={15} color={colors.muted} style={{ lineHeight: 22 }}>
                  Enter your Product ID and WhatsApp Business API credentials to start sending patient messages.
                </T>
              </View>
              <Field label="Product ID" icon="hash" placeholder="e.g. CLN-20417" value={productId} onChangeText={setProductId} autoCapitalize="characters" error={errors.productId} />
              <Field label="Phone Number ID" icon="phone" placeholder="WhatsApp phone number ID" value={phoneId} onChangeText={setPhoneId} keyboardType="number-pad" error={errors.phoneId} />
              <Field label="API Access Token" icon="key" placeholder="••••••••••••••••••••••••" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" error={errors.token} onSubmitEditing={submit} />
              <Button kind="primary" label={loading ? 'Connecting…' : 'Connect & Continue'} icon={loading ? undefined : 'arrow-right'} onPress={submit} disabled={loading} style={{ paddingVertical: 14 }} />
              {loading ? <ActivityIndicator color={colors.primary} /> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Icon name="lock" size={16} color={colors.muted} />
                <T size={13} color={colors.muted} style={{ flex: 1, lineHeight: 19 }}>Your credentials are encrypted and only used to send and track messages.</T>
              </View>
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
