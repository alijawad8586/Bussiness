import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';
import { Toast } from './src/components/Toast';
import Login from './src/screens/Login';
import Dashboard from './src/screens/Dashboard';
import Inbox from './src/screens/Inbox';
import Messages from './src/screens/Messages';
import Reports from './src/screens/Reports';
import ReportDetail from './src/screens/ReportDetail';
import Settings from './src/screens/Settings';

function Router() {
  const { ready, creds, route } = useStore();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!creds) return <Login />;
  switch (route.name) {
    case 'inbox': return <Inbox openId={route.open} />;
    case 'messages': return <Messages initialQuery={route.query} />;
    case 'reports': return <Reports />;
    case 'report': return <ReportDetail id={route.id} />;
    case 'settings': return <Settings />;
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
