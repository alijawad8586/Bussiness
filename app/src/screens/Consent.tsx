import React, { useState } from 'react';
import { View } from 'react-native';
import { colors, font } from '../theme';
import { POLICY_VERSION } from '../legal';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Check, T } from '../components/ui';
import { useStore } from '../store';

/** Shown once after sign-in when the user has not accepted the current policy version. */
export default function Consent() {
  const { acceptPrivacy, openPrivacy, logOut, consent } = useStore();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true); setError('');
    try {
      await acceptPrivacy();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === 'permission-denied' ? 'Could not save your choice. The latest database rules (including the privacy collection) have not been published yet.' : 'Could not save your choice. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={consent ? 'Our privacy policy changed' : 'Before you continue'} subtitle="Please read how we handle your data and your contacts' data.">
      <View style={{ backgroundColor: colors.tint, borderRadius: 10, padding: 14, gap: 6 }}>
        <T size={13} weight={font.semi} color={colors.dark}>In short</T>
        {[
          'We store your account, the contacts you upload and your messages in your own private space.',
          'Messages go through WhatsApp. If you turn on Agent mode, your chosen AI sees the chat to reply.',
          'We never sell data. You can ask us to delete it at any time.',
          'Only message people who agreed to hear from you. STOP is always honoured.',
        ].map((t) => <T key={t} size={13} color={colors.dark}>• {t}</T>)}
      </View>
      <T size={14} weight={font.medium} color={colors.primary} onPress={openPrivacy}>Read the full Privacy Policy (version {POLICY_VERSION})</T>
      <Check checked={agree} onChange={setAgree}>
        <T size={14} style={{ lineHeight: 20 }}>I have read and accept the Privacy Policy.</T>
      </Check>
      {error ? <T size={13} color={colors.danger}>{error}</T> : null}
      <Button kind="primary" label={busy ? 'Saving…' : 'Accept and continue'} onPress={accept} disabled={!agree || busy} style={{ paddingVertical: 14 }} />
      <T size={13} color={colors.primary} onPress={logOut}>Log out</T>
    </AuthLayout>
  );
}
