import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { Button, Card, T } from './src/components/ui';
import { colors } from './src/theme';
import { Toast } from './src/components/Toast';
import Auth from './src/screens/Auth';
import Connect from './src/screens/Connect';
import Dashboard from './src/screens/Dashboard';
import Inbox from './src/screens/Inbox';
import Messages from './src/screens/Messages';
import Reports from './src/screens/Reports';
import ReportDetail from './src/screens/ReportDetail';
import Settings from './src/screens/Settings';
import Privacy from './src/screens/Privacy';
import Consent from './src/screens/Consent';
import { POLICY_VERSION } from './src/legal';

/** Shown when the database exists but its security rules are not deployed yet. */
function SetupHelp() {
  const { logOut } = useStore();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <Card style={{ maxWidth: 520, gap: 14 }}>
        <T size={20} weight="700">One last setup step</T>
        <T color={colors.muted} style={{ lineHeight: 22 }}>
          Your database is ready, but its security rules have not been published yet, so the app is not allowed to read it.
          Run this once in the project folder:
        </T>
        <View style={{ backgroundColor: colors.tint, borderRadius: 8, padding: 12 }}>
          <T size={13} color={colors.dark}>firebase deploy --only firestore</T>
        </View>
        <T size={13} color={colors.muted}>This publishes firestore.rules and firestore.indexes.json. Then reload this page.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="primary" label="Reload" onPress={() => { if (typeof window !== 'undefined') window.location.reload(); }} />
          <Button label="Log out" onPress={logOut} />
        </View>
      </Card>
    </View>
  );
}

function Router() {
  const { authReady, user, loaded, server, route, dataError, consent, consentLoaded, publicPage, closePrivacy } = useStore();
  // The privacy policy is public: it opens without signing in
  if (publicPage === 'privacy') return <Privacy onBack={closePrivacy} />;
  if (!authReady || (user && (!loaded || !consentLoaded))) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Auth />;
  if (consent?.version !== POLICY_VERSION) return <Consent />;
  if (dataError && !server.whatsapp && /permission|PERMISSION/i.test(dataError)) return <SetupHelp />;
  // first time: WhatsApp must be connected before anything else
  if (!server.whatsapp) return <Connect canCancel={false} />;
  switch (route.name) {
    case 'connect': return <Connect canCancel />;
    case 'inbox': return <Inbox openId={route.open} />;
    case 'messages': return <Messages initialQuery={route.query} />;
    case 'reports': return <Reports />;
    case 'report': return <ReportDetail id={route.id} />;
    case 'settings': return <Settings initialTab={route.tab} />;
    default: return <Dashboard />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Router />
        <Toast />
        <StatusBar style="auto" />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
