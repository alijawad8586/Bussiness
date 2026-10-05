import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { colors, font } from '../theme';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Chip, Field, Icon, T } from '../components/ui';

/** Firebase error codes in plain words */
function explain(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is wrong.',
    'auth/wrong-password': 'Email or password is wrong.',
    'auth/user-not-found': 'Email or password is wrong.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'This email is already registered. Please log in.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/popup-closed-by-user': 'Google sign-in was closed.',
    'auth/popup-blocked': 'Your browser blocked the Google pop-up. Allow pop-ups and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on in Firebase yet (Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'This website address is not allowed in Firebase (Authentication → Settings → Authorized domains).',
  };
  return map[code] ?? 'Sign-in failed. Please try again.';
}

/** Creates the user's profile document the first time they sign in. */
async function saveProfile(uid: string, name: string, email: string) {
  await setDoc(doc(db, 'users', uid), { name, email, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        await saveProfile(cred.user.uid, name.trim() || email.trim(), email.trim());
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await saveProfile(cred.user.uid, cred.user.displayName || email.trim(), email.trim());
      }
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(''); setInfo('');
    if (Platform.OS !== 'web') return setError('Google sign-in works in the web version. Please use email and password here.');
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await saveProfile(cred.user.uid, cred.user.displayName || cred.user.email || '', cred.user.email || '');
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Type your email above first.');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('If this email has an account, a reset link is on its way.');
    } catch (e) {
      setError(explain(e));
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
      {info ? <T size={13} color="#15803d">{info}</T> : null}
      <Button kind="primary" label={busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'} onPress={submit} disabled={busy} style={{ paddingVertical: 14 }} />
      {mode === 'login' ? <T size={13} color={colors.primary} onPress={reset}>Forgot password?</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <T size={12} color={colors.muted} weight={font.medium}>or</T>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      <Button label="Continue with Google" icon="globe" onPress={google} disabled={busy} style={{ paddingVertical: 12 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="info" size={16} color={colors.muted} />
        <T size={12} color={colors.muted} style={{ flex: 1, lineHeight: 18 }}>Your data is stored securely in your own CareReach account.</T>
      </View>
    </AuthLayout>
  );
}
