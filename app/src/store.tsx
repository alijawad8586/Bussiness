import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Chat, Conversation, MESSAGES, Report, SEED_CONVERSATIONS, SEED_REPORTS, TEMPLATES, TODAY, summarize,
} from './data';

export type Route =
  | { name: 'dashboard' }
  | { name: 'inbox'; open?: string }
  | { name: 'messages'; query?: string }
  | { name: 'reports' }
  | { name: 'report'; id: string }
  | { name: 'settings' };

export interface Credentials {
  productId: string;
  phoneId: string;
  token: string;
}

export interface Settings {
  source: 'sheet' | 'upload';
  fileName: string;
  rows: number;
  lastSynced: number; // epoch ms
  columns: string[];
  mapping: { phone: string; patient: string; doctor: string; time: string };
  template: string;
  autoSend: boolean;
  checkNumbers: boolean;
  retry: boolean;
  schedule: string;
  speed: string;
}

export const DEFAULT_COLUMNS = ['phone_number', 'patient_name', 'doctor', 'appointment_time', 'notes'];

const DEFAULT_SETTINGS: Settings = {
  source: 'sheet',
  fileName: 'Patients_Oct.gsheet',
  rows: 1248,
  lastSynced: Date.now() - 2 * 60 * 1000,
  columns: DEFAULT_COLUMNS,
  mapping: { phone: 'phone_number', patient: 'patient_name', doctor: 'doctor', time: 'appointment_time' },
  template: 'appointment_reminder',
  autoSend: true,
  checkNumbers: true,
  retry: false,
  schedule: 'Daily at 09:00',
  speed: '20 messages / minute',
};

interface Persisted {
  creds: Credentials | null;
  settings: Settings;
  reports: Report[];
  convs: Conversation[];
}

const KEY = 'carereach:v1';

interface Store {
  ready: boolean;
  creds: Credentials | null;
  connect: (c: Credentials) => void;
  disconnect: () => void;
  route: Route;
  go: (r: Route) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  reports: Report[];
  generateReport: (template?: string) => Report;
  convs: Conversation[];
  unreadCount: number;
  openConversation: (id: string) => void;
  sendChat: (id: string, text: string, template?: string) => void;
  toast: string | null;
  showToast: (m: string) => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [reports, setReports] = useState<Report[]>(SEED_REPORTS);
  const [convs, setConvs] = useState<Conversation[]>(SEED_CONVERSATIONS);
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved state once.
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const p: Persisted = JSON.parse(raw);
        setCreds(p.creds);
        setSettings({ ...DEFAULT_SETTINGS, ...p.settings });
        if (p.reports?.length) setReports(p.reports);
        if (p.convs?.length) setConvs(p.convs);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Save on change (after the first load).
  useEffect(() => {
    if (!ready) return;
    const data: Persisted = { creds, settings, reports, convs };
    AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [ready, creds, settings, reports, convs]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const connect = useCallback((c: Credentials) => {
    setCreds(c);
    setRoute({ name: 'dashboard' });
  }, []);

  const disconnect = useCallback(() => setCreds(null), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const generateReport = useCallback((template?: string): Report => {
    const tpl = TEMPLATES.find((t) => t.name === (template ?? settings.template)) ?? TEMPLATES[0];
    const base = summarize(MESSAGES);
    const r: Report = {
      id: `r${Date.now()}`,
      name: tpl.label,
      date: TODAY,
      template: tpl.name,
      ...base,
      source: 'Patients sheet',
    };
    setReports((list) => [r, ...list]);
    return r;
  }, [settings.template]);

  const openConversation = useCallback((id: string) => {
    setConvs((list) => list.map((c) => (c.id === id && c.unread ? { ...c, unread: 0 } : c)));
  }, []);

  const sendChat = useCallback((id: string, text: string, template?: string) => {
    setConvs((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const chat: Chat = { id: `${id}-${Date.now()}`, dir: 'out', text, time: nowHHMM(), template, read: false };
        return { ...c, chats: [...c.chats, chat], time: chat.time, ...(template ? { template } : {}) };
      }),
    );
  }, []);

  const unreadCount = useMemo(() => convs.filter((c) => c.unread > 0).length, [convs]);

  const value = useMemo<Store>(
    () => ({
      ready, creds, connect, disconnect, route, go: setRoute, settings, updateSettings, reports,
      generateReport, convs, unreadCount, openConversation, sendChat, toast, showToast,
    }),
    [ready, creds, connect, disconnect, route, settings, updateSettings, reports, generateReport, convs,
      unreadCount, openConversation, sendChat, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

