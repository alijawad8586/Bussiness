import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';
import { api } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field, Icon, T } from '../components/ui';
import { useStore } from '../store';

/** Step 2: connect the WhatsApp Business API. The backend checks the details with WhatsApp before saving them. */
/** Keeps only the digits, so pasted values like "+92 300-1234567" or "1234 5678" still work. */
const digitsOnly = (v: string) => v.replace(/\D/g, '');

export default function Connect({ canCancel }: { canCancel: boolean }) {
  const { server, go, logOut, showToast } = useStore();
  const old = server.whatsapp;
  const [productId, setProductId] = useState(old?.productId ?? '');
  const [wabaId, setWabaId] = useState(old?.wabaId ?? '');
  const [phoneId, setPhoneId] = useState(old?.phoneNumberId ?? '');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!productId.trim()) e.productId = 'Enter your Product ID';
    if (digitsOnly(wabaId).length < 5) e.wabaId = 'Enter the Business Account ID from Meta (numbers only)';
    if (digitsOnly(phoneId).length < 5) e.phoneId = 'Enter the Phone Number ID from Meta (numbers only)';
    if (token.trim().length < 20) e.token = 'Access token looks too short';
    setErrors(e); setFormError('');
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const r = await api.connectWhatsApp({ productId: productId.trim(), wabaId: digitsOnly(wabaId), phoneNumberId: digitsOnly(phoneId), token: token.trim() });
      showToast(`WhatsApp connected: ${r.displayNumber}`);
      go({ name: 'dashboard' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Connect your WhatsApp API" subtitle="Enter your WhatsApp Business API details. We check them with WhatsApp before saving.">
      <Field label="Product ID" icon="hash" placeholder="e.g. CLN-20417" value={productId} onChangeText={setProductId} autoCapitalize="characters" error={errors.productId} />
      <Field label="WhatsApp Business Account ID" icon="briefcase" placeholder="Used to load your approved templates" value={wabaId} onChangeText={(t) => setWabaId(digitsOnly(t))} keyboardType="number-pad" error={errors.wabaId} />
      <Field label="Phone Number ID" icon="phone" placeholder="WhatsApp phone number ID" value={phoneId} onChangeText={(t) => setPhoneId(digitsOnly(t))} keyboardType="number-pad" error={errors.phoneId}
        hint="Not your phone number. It is the long ID (about 15 digits) in Meta → WhatsApp → API Setup. You do not need a country code here." />
      <Field label="API Access Token" icon="key" placeholder={old ? 'Paste a new token' : '••••••••••••••••••••••••'} value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" error={errors.token} onSubmitEditing={submit} />
      {formError ? <T size={13} color={colors.danger}>{formError}</T> : null}
      <Button kind="primary" label={loading ? 'Checking with WhatsApp…' : 'Connect & Continue'} icon={loading ? undefined : 'arrow-right'} onPress={submit} disabled={loading} style={{ paddingVertical: 14 }} />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="lock" size={16} color={colors.muted} />
        <T size={13} color={colors.muted} style={{ flex: 1, lineHeight: 19 }}>Your token is stored only on our server. It is never sent back to this app.</T>
      </View>
      {canCancel ? <T size={13} color={colors.primary} onPress={() => go({ name: 'settings' })}>Cancel</T> : <T size={13} color={colors.primary} onPress={logOut}>Use a different account (log out)</T>}
    </AuthLayout>
  );
}
