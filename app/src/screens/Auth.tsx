import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { colors, font } from '../theme';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Chip, Field, Icon, T } from '../components/ui';
import { googleSignIn, googleSupported } from '../google';
import { useStore } from '../store';

/** Step 1: create an account or log in. Accounts are stored on this device only. */
export default function Auth() {
  const { signUp, logIn, loginWithProfile, googleClient, setGoogleClient } = useStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    const err = mode === 'signup' ? await signUp(name, email, password) : await logIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  const google = async () => {
    setError('');
    if (!googleSupported) return setError('Google sign-in works in the web version. Use email and password here.');
    let id = googleClient;
    if (!id) {
      const entered = (window.prompt('Paste your Google OAuth Client ID (Google Cloud Console → Credentials). Add this site as an authorized JavaScript origin.') ?? '').trim();
      if (!entered) return;
      id = entered;
      setGoogleClient(id);
    }
    try {
      setBusy(true);
      await loginWithProfile(await googleSignIn(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={mode === 'login' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'login' ? 'Log in to continue to CareReach.' : 'Sign up to start messaging your patients.'}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Login" active={mode === 'login'} onPress={() => { setMode('login'); setError(''); }} />
        <Chip label="Sign up" active={mode === 'signup'} onPress={() => { setMode('signup'); setError(''); }} />
      </View>
      {mode === 'signup' ? <Field label="Name" icon="user" placeholder="Your name" value={name} onChangeText={setName} autoComplete="name" /> : null}
      <Field label="Email" icon="mail" placeholder="you@clinic.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" icon="lock" placeholder="At least 6 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" onSubmitEditing={submit} />
      {error ? <T size={13} color={colors.danger}>{error}</T> : null}
      <Button kind="primary" label={busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'} onPress={submit} disabled={busy} style={{ paddingVertical: 14 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <T size={12} color={colors.muted} weight={font.medium}>or</T>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      <Button label="Continue with Google" icon="globe" onPress={google} disabled={busy} style={{ paddingVertical: 12 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="info" size={16} color={colors.muted} />
        <T size={12} color={colors.muted} style={{ flex: 1, lineHeight: 18 }}>
          {Platform.OS === 'web' ? 'Accounts are saved in this browser only.' : 'Accounts are saved on this device only.'}
        </T>
      </View>
    </AuthLayout>
  );
}
