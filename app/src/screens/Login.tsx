import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field, Icon, T } from '../components/ui';
import { useStore } from '../store';

/** Step 2: connect the WhatsApp Business API (after the account login). */
export default function Login() {
  const { connect, logOut } = useStore();
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

  return (
    <AuthLayout title="Connect your WhatsApp API" subtitle="Enter your Product ID and WhatsApp Business API credentials to start sending patient messages.">
      <Field label="Product ID" icon="hash" placeholder="e.g. CLN-20417" value={productId} onChangeText={setProductId} autoCapitalize="characters" error={errors.productId} />
      <Field label="Phone Number ID" icon="phone" placeholder="WhatsApp phone number ID" value={phoneId} onChangeText={setPhoneId} keyboardType="number-pad" error={errors.phoneId} />
      <Field label="API Access Token" icon="key" placeholder="••••••••••••••••••••••••" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" error={errors.token} onSubmitEditing={submit} />
      <Button kind="primary" label={loading ? 'Connecting…' : 'Connect & Continue'} icon={loading ? undefined : 'arrow-right'} onPress={submit} disabled={loading} style={{ paddingVertical: 14 }} />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="lock" size={16} color={colors.muted} />
        <T size={13} color={colors.muted} style={{ flex: 1, lineHeight: 19 }}>Your credentials are encrypted and only used to send and track messages.</T>
      </View>
      <T size={13} color={colors.primary} onPress={logOut}>Use a different account (log out)</T>
    </AuthLayout>
  );
}
