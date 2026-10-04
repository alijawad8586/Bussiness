import { Platform } from 'react-native';

declare const window: any;
declare const document: any;

export const googleSupported = Platform.OS === 'web';

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check your internet.'));
    document.head.appendChild(s);
  });
}

/** Web only: opens the Google popup and returns the account's name and email. */
export async function googleSignIn(clientId: string): Promise<{ email: string; name: string }> {
  await loadScript();
  const token: string = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (r: any) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || 'Google sign-in failed'))),
      error_callback: (e: any) => reject(new Error(e?.message || e?.type || 'Google sign-in was closed')),
    });
    client.requestAccessToken();
  });
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('Could not read your Google profile');
  const p = await r.json();
  return { email: String(p.email).toLowerCase(), name: p.name || p.email };
}
