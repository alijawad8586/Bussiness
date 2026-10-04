import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AiKeys, AiProvider, BUILTIN_PROVIDERS, ChatMsg, Sheet } from './ai';
import {
  Chat, Conversation, MESSAGES, Report, SEED_CONVERSATIONS, SEED_REPORTS, TEMPLATES, TODAY, summarize,
} from './data';

export type Route =
  | { name: 'dashboard' }
  | { name: 'inbox'; open?: string }
  | { name: 'messages'; query?: string }
  | { name: 'reports' }
  | { name: 'report'; id: string }
  | { name: 'settings' }
  | { name: 'api' }
  | { name: 'sheet' }
  | { name: 'agent' };

export interface User {
  email: string;
  name: string;
}

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
  aiKeys: AiKeys;
  aiCustom: AiProvider[];
}

// Everything below is stored per account (keyed by email).
const dataKey = (email: string) => `carereach:v2:${email}`;
const sheetKey = (email: string) => `carereach:sheet:${email}`;
const USERS_KEY = 'bz_users';
const SESSION_KEY = 'bz_session';
const GOOGLE_KEY = 'bz_google_client';

type UserRecord = { name: string; salt: string; hash: string };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

const hashPassword = (pw: string, salt: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + pw);

interface Store {
  ready: boolean;
  user: User | null;
  /** Each returns an error message, or null on success. */
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  logIn: (email: string, password: string) => Promise<string | null>;
  loginWithProfile: (u: User) => Promise<void>;
  logOut: () => void;
  googleClient: string;
  setGoogleClient: (id: string) => void;
  aiKeys: AiKeys;
  aiCustom: AiProvider[];
  providers: AiProvider[];
  saveAiKey: (id: string, key: string, model: string) => void;
  addAiProvider: (p: Omit<AiProvider, 'id' | 'custom' | 'kind'>) => void;
  removeAiProvider: (id: string) => void;
  sheet: Sheet | null;
  setSheet: (s: Sheet | null) => void;
  chat: ChatMsg[];
  setChat: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
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
  const [booted, setBooted] = useState(false); // saved login read
  const [ready, setReady] = useState(false); // this account's data loaded
  const [user, setUser] = useState<User | null>(null);
  const [googleClient, setGoogleClientState] = useState('');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [reports, setReports] = useState<Report[]>(SEED_REPORTS);
  const [convs, setConvs] = useState<Conversation[]>(SEED_CONVERSATIONS);
  const [aiKeys, setAiKeys] = useState<AiKeys>({});
  const [aiCustom, setAiCustom] = useState<AiProvider[]>([]);
  const [sheet, setSheetState] = useState<Sheet | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) Who was logged in last time?
  useEffect(() => {
    Promise.all([readJson<User | null>(SESSION_KEY, null), readJson<string>(GOOGLE_KEY, '')]).then(([u, g]) => {
      setUser(u);
      setGoogleClientState(g);
      setBooted(true);
    });
  }, []);

  // 2) Load that account's data (or start clean when logged out).
  const email = user?.email;
  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      if (!email) {
        setCreds(null); setSettings(DEFAULT_SETTINGS); setReports(SEED_REPORTS); setConvs(SEED_CONVERSATIONS);
        setAiKeys({}); setAiCustom([]); setSheetState(null); setChat([]);
      } else {
        const p = await readJson<Partial<Persisted>>(dataKey(email), {});
        const sh = await readJson<Sheet | null>(sheetKey(email), null);
        if (cancelled) return;
        setCreds(p.creds ?? null);
        setSettings({ ...DEFAULT_SETTINGS, ...p.settings });
        setReports(p.reports?.length ? p.reports : SEED_REPORTS);
        setConvs(p.convs?.length ? p.convs : SEED_CONVERSATIONS);
        setAiKeys(p.aiKeys ?? {});
        setAiCustom(p.aiCustom ?? []);
        setSheetState(sh);
        setChat([]);
        setRoute({ name: 'dashboard' });
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [booted, email]);

  // 3) Save on change (only once this account's data has loaded).
  useEffect(() => {
    if (!ready || !email) return;
    const data: Persisted = { creds, settings, reports, convs, aiKeys, aiCustom };
    writeJson(dataKey(email), data);
  }, [ready, email, creds, settings, reports, convs, aiKeys, aiCustom]);

  const setSheet = useCallback((sh: Sheet | null) => {
    setSheetState(sh);
    if (!email) return;
    // Large sheets can exceed browser storage; the sheet stays usable for this session either way.
    if (sh) writeJson(sheetKey(email), sh);
    else AsyncStorage.removeItem(sheetKey(email)).catch(() => {});
  }, [email]);

  // ---- accounts (stored on this device only) ----
  const loginWithProfile = useCallback(async (u: User) => {
    await writeJson(SESSION_KEY, u);
    setUser(u);
  }, []);

  const signUp = useCallback(async (name: string, em: string, password: string) => {
    const key = em.trim().toLowerCase();
    const users = await readJson<Record<string, UserRecord>>(USERS_KEY, {});
    if (users[key]) return 'This email is already registered. Please log in.';
    const salt = Array.from(Crypto.getRandomBytes(8)).map((b) => b.toString(16).padStart(2, '0')).join('');
    users[key] = { name: name.trim() || key, salt, hash: await hashPassword(password, salt) };
    await writeJson(USERS_KEY, users);
    await loginWithProfile({ email: key, name: users[key].name });
    return null;
  }, [loginWithProfile]);

  const logIn = useCallback(async (em: string, password: string) => {
    const key = em.trim().toLowerCase();
    const users = await readJson<Record<string, UserRecord>>(USERS_KEY, {});
    const u = users[key];
    if (!u || u.hash !== (await hashPassword(password, u.salt))) return 'Email or password is wrong.';
    await loginWithProfile({ email: key, name: u.name });
    return null;
  }, [loginWithProfile]);

  const logOut = useCallback(() => {
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
    setUser(null);
  }, []);

  const setGoogleClient = useCallback((id: string) => {
    setGoogleClientState(id);
    writeJson(GOOGLE_KEY, id);
  }, []);

  // ---- AI providers ----
  const providers = useMemo(() => BUILTIN_PROVIDERS.concat(aiCustom), [aiCustom]);

  const saveAiKey = useCallback((id: string, key: string, model: string) => {
    setAiKeys((all) => {
      const next = { ...all };
      const base = BUILTIN_PROVIDERS.find((p) => p.id === id)?.model ?? 'default';
      if (key.trim()) next[id] = { key: key.trim(), model: model.trim() || base };
      else delete next[id];
      return next;
    });
  }, []);

  const addAiProvider = useCallback((p: Omit<AiProvider, 'id' | 'custom' | 'kind'>) => {
    setAiCustom((list) => [...list, { ...p, id: `c_${Date.now()}`, kind: 'openai', custom: true }]);
  }, []);

  const removeAiProvider = useCallback((id: string) => {
    setAiCustom((list) => list.filter((c) => c.id !== id));
    setAiKeys((all) => { const next = { ...all }; delete next[id]; return next; });
  }, []);

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
      ready, user, signUp, logIn, loginWithProfile, logOut, googleClient, setGoogleClient, aiKeys, aiCustom, providers,
      saveAiKey, addAiProvider, removeAiProvider, sheet, setSheet, chat, setChat, creds, connect, disconnect, route, go: setRoute, settings, updateSettings, reports,
      generateReport, convs, unreadCount, openConversation, sendChat, toast, showToast,
    }),
    [ready, user, signUp, logIn, loginWithProfile, logOut, googleClient, setGoogleClient, aiKeys, aiCustom, providers,
      saveAiKey, addAiProvider, removeAiProvider, sheet, setSheet, chat, creds, connect, disconnect, route, settings, updateSettings, reports, generateReport, convs,
      unreadCount, openConversation, sendChat, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

