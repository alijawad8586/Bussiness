import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User as FbUser } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Campaign, Contact, DEFAULT_MAIN, MainSettings, ms, ServerSettings, SheetInfo } from './types';

export type Route =
  | { name: 'dashboard' }
  | { name: 'inbox'; open?: string }
  | { name: 'messages'; query?: string }
  | { name: 'reports' }
  | { name: 'report'; id: string }
  | { name: 'settings'; tab?: 'source' | 'agent' }
  | { name: 'connect' };

export interface User {
  uid: string;
  email: string;
  name: string;
}

interface Store {
  authReady: boolean;
  user: User | null;
  logOut: () => void;
  route: Route;
  go: (r: Route) => void;
  toast: string | null;
  showToast: (m: string) => void;
  main: MainSettings;
  saveMain: (patch: Partial<MainSettings>) => Promise<void>;
  server: ServerSettings;
  /** false until the first answer from the database */
  loaded: boolean;
  contacts: Contact[];
  campaigns: Campaign[];
  lastSheet: SheetInfo | null;
  unreadCount: number;
  /** a problem reading data (for example a missing index), shown as a banner */
  dataError: string | null;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

const toUser = (u: FbUser): User => ({ uid: u.uid, email: u.email ?? '', name: u.displayName || (u.email ?? '').split('@')[0] });

function contactOf(id: string, d: DocumentData): Contact {
  return {
    id, phone: d.phone ?? id, name: d.name ?? '', doctor: d.doctor ?? '', fields: d.fields ?? {}, rowNumber: d.rowNumber ?? null,
    optOut: !!d.optOut, needsHuman: !!d.needsHuman, unread: d.unread ?? 0, lastMessageText: d.lastMessageText ?? '',
    lastMessageAt: ms(d.lastMessageAt), lastInboundAt: ms(d.lastInboundAt), lastStatus: d.lastStatus ?? null,
  };
}

export function campaignOf(id: string, d: DocumentData): Campaign {
  const z = { queued: 0, sent: 0, delivered: 0, failed: 0, notWhatsapp: 0 };
  return {
    id, template: d.template ?? { name: '', language: '', body: '' }, sheetName: d.sheetName ?? '', status: d.status ?? 'queued',
    total: d.total ?? 0, optOutSkipped: d.optOutSkipped ?? 0, speed: d.speed ?? 20, stats: { ...z, ...(d.stats ?? {}) },
    byDoctor: d.byDoctor ?? {}, failReasons: d.failReasons ?? {}, timeline: d.timeline ?? {}, error: d.error ?? null, createdAt: ms(d.createdAt) ?? 0,
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [toast, setToast] = useState<string | null>(null);
  const [main, setMain] = useState<MainSettings>(DEFAULT_MAIN);
  const [server, setServer] = useState<ServerSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lastSheet, setLastSheet] = useState<SheetInfo | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u ? toUser(u) : null); setAuthReady(true); }), []);

  // Live data for the signed-in user. Everything below updates by itself when the backend writes.
  const uid = user?.uid;
  useEffect(() => {
    setLoaded(false);
    setMain(DEFAULT_MAIN); setServer({}); setContacts([]); setCampaigns([]); setLastSheet(null); setDataError(null);
    if (!uid) return;
    const base = `users/${uid}`;
    // If the first read fails (for example the rules are not deployed yet) stop the spinner and show why.
    const fail = (e: Error & { code?: string }) => { console.error(e); setDataError(e.code === 'permission-denied' ? 'Missing or insufficient permissions.' : e.message); setLoaded(true); };
    const unsubs = [
      onSnapshot(doc(db, `${base}/settings/main`), (s) => setMain({ ...DEFAULT_MAIN, ...(s.data() as Partial<MainSettings> | undefined), mapping: { ...DEFAULT_MAIN.mapping, ...(s.data()?.mapping ?? {}) } }), fail),
      onSnapshot(doc(db, `${base}/settings/server`), (s) => { setServer((s.data() as ServerSettings | undefined) ?? {}); setLoaded(true); }, fail),
      onSnapshot(query(collection(db, `${base}/contacts`), orderBy('lastMessageAt', 'desc'), limit(500)), (s: QuerySnapshot) => setContacts(s.docs.map((d) => contactOf(d.id, d.data()))), fail),
      onSnapshot(query(collection(db, `${base}/campaigns`), orderBy('createdAt', 'desc'), limit(50)), (s) => setCampaigns(s.docs.map((d) => campaignOf(d.id, d.data()))), fail),
      onSnapshot(query(collection(db, `${base}/sheets`), orderBy('createdAt', 'desc'), limit(1)), (s) => {
        const d = s.docs[0];
        setLastSheet(d ? ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) ?? 0 } as SheetInfo) : null);
      }, fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const saveMain = useCallback(async (patch: Partial<MainSettings>) => {
    if (!uid) return;
    await setDoc(doc(db, `users/${uid}/settings/main`), { ...main, ...patch });
  }, [uid, main]);

  const logOut = useCallback(() => { signOut(auth).catch(() => {}); setRoute({ name: 'dashboard' }); }, []);

  const unreadCount = useMemo(() => contacts.filter((c) => c.unread > 0).length, [contacts]);

  const value = useMemo<Store>(
    () => ({ authReady, user, logOut, route, go: setRoute, toast, showToast, main, saveMain, server, loaded, contacts, campaigns, lastSheet, unreadCount, dataError }),
    [authReady, user, logOut, route, toast, showToast, main, saveMain, server, loaded, contacts, campaigns, lastSheet, unreadCount, dataError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
