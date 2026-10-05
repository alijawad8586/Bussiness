import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { colors, font } from '../theme';
import { api } from '../api';
import { db } from '../firebase';
import { formatTime, phoneLabel, shortTime } from '../format';
import { messageOf, userCol } from '../hooks';
import { Avatar, Button, Card, Chip, CountBadge, Empty, Field, Icon, MsgBadge, SearchBox, Select, Sheet, T, Ticks, useLayout } from '../components/ui';
import { COUNTRIES, groupDigits } from '../countries';
import { Shell } from '../components/Shell';
import { Contact, Message, MsgStatus } from '../types';
import { renderBody } from '../template';
import { useStore } from '../store';

type Tab = 'All' | 'Unread' | 'Failed';
const WINDOW_MS = 24 * 3600_000;
const failedStatus = (s: MsgStatus | null) => s === 'failed' || s === 'not_on_whatsapp';

function ConversationRow({ c, active, onPress }: { c: Contact; active: boolean; onPress: () => void }) {
  const failed = failedStatus(c.lastStatus);
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: active ? colors.tintSoft : '#fff' }}>
      <Avatar name={c.name || c.phone} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T weight={font.semi} numberOfLines={1} style={{ flex: 1 }}>{c.name || phoneLabel(c.phone)}</T>
          <T size={12} weight={c.unread ? font.medium : font.regular} color={c.unread ? colors.primary : colors.muted}>{shortTime(c.lastMessageAt)}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            {failed ? <Icon name="x-circle" size={15} color={colors.danger} /> : null}
            <T size={13} color={failed ? colors.danger : colors.muted} numberOfLines={1} style={{ flex: 1 }}>{c.lastMessageText}</T>
          </View>
          {c.needsHuman ? <T size={11} weight={font.semi} color={colors.danger}>Needs staff</T> : null}
          {c.unread ? <CountBadge n={c.unread} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Details({ c, onClose }: { c: Contact; onClose?: () => void }) {
  const row = (k: string, v: string) => <View style={{ gap: 4 }}><T size={12} color={colors.muted}>{k}</T><T weight={font.medium}>{v}</T></View>;
  return (
    <View style={{ gap: 20, flex: 1 }}>
      {onClose ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={15} weight={font.semi}>Contact info</T>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close contact info"><Icon name="x" size={20} color={colors.muted} /></Pressable>
        </View>
      ) : null}
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={c.name || c.phone} size={72} />
        <T size={17} weight={font.semi}>{c.name || phoneLabel(c.phone)}</T>
      </View>
      {row('Phone', phoneLabel(c.phone))}
      {c.doctor ? row('Doctor', c.doctor) : null}
      {c.lastInboundAt ? row('Last message from patient', new Date(c.lastInboundAt).toLocaleString()) : null}
      {c.whatsapp === 'invalid' ? <T size={13} weight={font.semi} color={colors.danger}>Not on WhatsApp</T> : null}
      {c.optOut ? <T size={13} weight={font.semi} color={colors.danger}>Asked to stop messages</T> : null}
      {c.needsHuman ? <T size={13} weight={font.semi} color={colors.danger}>Needs staff</T> : null}
    </View>
  );
}

function Ticking({ m }: { m: Message }) {
  if (m.status === 'failed' || m.status === 'not_on_whatsapp') return <Icon name="x-circle" size={14} color={colors.danger} />;
  if (m.status === 'queued') return <Icon name="clock" size={13} color={colors.placeholder} />;
  if (m.status === 'sent') return <Icon name="check" size={14} color={colors.placeholder} />;
  return <Ticks read={m.status === 'read'} size={14} />;
}

export default function Inbox({ openId }: { openId?: string }) {
  const { contacts, user, go, showToast, unreadCount, main } = useStore();
  const { wide, xl, height } = useLayout();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('All');
  const [selected, setSelected] = useState<string | null>(openId ?? null);
  const [saved, setSaved] = useState<Message[]>([]);
  // Messages you just sent show at once, before the server confirms them
  const [pending, setPending] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [cc, setCc] = useState('92');
  const [ccOther, setCcOther] = useState('');
  const [nat, setNat] = useState('');
  const [newName, setNewName] = useState('');
  const listRef = useRef<FlatList>(null);

  // a chat you just started shows up at once, even before the first message
  const chats = useMemo(() => contacts.filter((c) => c.lastMessageAt || c.id === selected), [contacts, selected]);
  const current = contacts.find((c) => c.id === selected) ?? null;
  useEffect(() => { if (wide && !selected && chats[0]) setSelected(chats[0].id); }, [wide, selected, chats]);

  // a pending message disappears as soon as the saved copy arrives
  const messages = useMemo(
    () => [...saved, ...pending.filter((p) => p.status === 'failed' || !saved.some((m) => m.direction === 'out' && m.kind === p.kind && m.createdAt >= p.createdAt - 15_000))],
    [saved, pending],
  );

  // Live chat history for the open conversation
  useEffect(() => {
    setSaved([]); setPending([]);
    if (!user || !selected) return;
    return onSnapshot(query(userCol(user.uid, 'messages'), where('contactId', '==', selected), orderBy('createdAt', 'asc'), limit(300)),
      (s) => setSaved(s.docs.map((d) => messageOf(d.id, d.data()))), (e) => showToast(/index/i.test(e.message) ? 'The chat needs a database index. Run: firebase deploy --only firestore:indexes' : e.message));
  }, [user, selected, showToast]);

  // Opening a chat marks it read
  useEffect(() => {
    if (user && current && current.unread > 0) updateDoc(doc(db, `users/${user.uid}/contacts/${current.id}`), { unread: 0 }).catch(() => {});
  }, [user, current?.id, current?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, selected]);

  const counts = useMemo(() => ({ All: chats.length, Unread: chats.filter((c) => c.unread > 0).length, Failed: chats.filter((c) => failedStatus(c.lastStatus)).length }), [chats]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return chats.filter((c) => (tab === 'All' || (tab === 'Unread' ? c.unread > 0 : failedStatus(c.lastStatus))) && (!s || c.name.toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g, '') || '\u0000')));
  }, [chats, q, tab]);

  const inWindow = !!current?.lastInboundAt && Date.now() - current.lastInboundAt < WINDOW_MS;

  const addPending = (c: Contact, kind: 'text' | 'template', text: string, template: string | null): string => {
    const id = `local_${Date.now()}`;
    setPending((p) => [...p, {
      id, contactId: c.id, phone: c.phone, patient: c.name, doctor: c.doctor, direction: 'out', kind, by: 'manual', template, text,
      status: 'queued', error: null, createdAt: Date.now(), outAt: null,
    }]);
    return id;
  };
  // WhatsApp refused it: the server saved a red "failed" message, so the temporary one is simply removed
  const dropPending = (id: string) => setPending((p) => p.filter((m) => m.id !== id));
  const failPending = (id: string, hint: string) =>
    setPending((p) => p.map((m) => (m.id === id ? { ...m, status: 'failed', error: { code: 0, message: hint, hint } } : m)));

  const send = async () => {
    const text = draft.trim();
    if (!current || !text) return;
    setDraft('');
    const id = addPending(current, 'text', text, null);
    try {
      const r = await api.sendManual({ contactId: current.id, text });
      if (r.status === 'failed') dropPending(id);
    } catch (e) {
      failPending(id, e instanceof Error ? e.message : 'Could not send');
    }
  };

  const sendTemplate = async () => {
    if (!current || !main.template) return;
    setTplOpen(false);
    const id = addPending(current, 'template', renderBody(main.template.body, main.varCols.map((k) => current.fields[k] ?? '')), main.template.name);
    try {
      const r = await api.sendTemplate({ contactId: current.id });
      if (r.status === 'failed') dropPending(id);
    } catch (e) {
      failPending(id, e instanceof Error ? e.message : 'Could not send');
    }
  };

  const code = cc === 'other' ? ccOther.replace(/\D/g, '') : cc;
  const startNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.startChat({ countryCode: code, phone: nat, name: newName });
      setSelected(r.contactId);
      setNewOpen(false); setNat(''); setNewName('');
      showToast(r.created ? 'Chat ready. Send the template to start the conversation.' : 'This number is already in your contacts.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start the chat');
    } finally {
      setBusy(false);
    }
  };

  const tplPreview = main.template && current ? renderBody(main.template.body, main.varCols.map((k) => current.fields[k] ?? '')) : '';
  const showList = wide || !current;
  const showChat = wide || !!current;
  const boxH = wide ? Math.max(520, height - 190) : undefined;

  const listPane = (
    <Card style={{ padding: 0, overflow: 'hidden', width: wide ? 360 : undefined, flex: wide ? undefined : 1 }}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><SearchBox value={q} onChangeText={setQ} placeholder="Search patient or phone number" /></View>
          <Pressable onPress={() => setNewOpen(true)} accessibilityRole="button" accessibilityLabel="New chat" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" size={18} color="#fff" />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['All', 'Unread', 'Failed'] as Tab[]).map((t) => <Chip key={t} label={`${t} ${counts[t]}`} active={tab === t} onPress={() => setTab(t)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationRow c={item} active={item.id === selected} onPress={() => setSelected(item.id)} />}
        ListEmptyComponent={<Empty text={chats.length ? 'No conversations found.' : 'No conversations yet. They appear after you send or receive a message.'} />}
        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
      />
    </Card>
  );

  const chatPane = current ? (
    <Card style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {!wide ? <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Back to conversations"><Icon name="arrow-left" size={22} color={colors.text} /></Pressable> : null}
        <Avatar name={current.name || current.phone} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15} weight={font.semi} numberOfLines={1}>{current.name || phoneLabel(current.phone)}</T>
          <T size={12} color={colors.muted} numberOfLines={1}>{phoneLabel(current.phone)}</T>
        </View>
        <Pressable onPress={() => (xl ? setPanelOpen((v) => !v) : setInfoOpen(true))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Contact info"><Icon name="info" size={20} color={xl && panelOpen ? colors.primary : colors.muted} /></Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ flex: 1, backgroundColor: colors.chatBg }}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        ListEmptyComponent={<T color={colors.muted} style={{ textAlign: 'center', paddingTop: 30 }}>No messages yet.</T>}
        renderItem={({ item: m }) => {
          const out = m.direction === 'out';
          return (
            <View style={{ alignItems: out ? 'flex-end' : 'flex-start' }}>
              <View style={{ maxWidth: '85%', backgroundColor: out ? colors.bubbleOut : '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
                {m.template ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="file-text" size={12} color={colors.primary} />
                    <T size={11} weight={font.medium} color={colors.primary}>Template · {m.template}</T>
                  </View>
                ) : null}
                {out && m.by === 'agent' ? <T size={11} weight={font.medium} color={colors.primary}>AI reply</T> : null}
                <T size={14} style={{ lineHeight: 20 }}>{m.text}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <T size={11} color={colors.muted}>{formatTime(m.createdAt)}</T>
                  {out ? <Ticking m={m} /> : null}
                </View>
              </View>
              {m.error ? <T size={11} color={colors.danger} style={{ maxWidth: '85%', marginTop: 3 }}>{m.error.hint}</T> : null}
              {!out && m.agentOutcome === 'ai_failed' ? <T size={11} color={colors.danger} style={{ maxWidth: '85%', marginTop: 3 }}>AI could not reply{m.agentError ? `: ${m.agentError.slice(0, 120)}` : ''}</T> : null}
              {!out && m.agentOutcome === 'rate_limited' ? <T size={11} color={colors.muted} style={{ marginTop: 3 }}>AI reply limit reached for this patient</T> : null}
            </View>
          );
        }}
      />

      {!inWindow && !current.optOut ? (
        <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 16, paddingVertical: 8 }}>
          <T size={12} color="#b45309">The patient has not written in the last 24 hours. WhatsApp only allows an approved template now.</T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' }}>
        <View style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.bg, paddingHorizontal: 14, justifyContent: 'center' }}>
          <TextInput
            value={draft} onChangeText={setDraft} onSubmitEditing={send} editable={!current.optOut}
            placeholder={current.optOut ? 'Patient opted out' : 'Type a message…'} placeholderTextColor={colors.placeholder}
            returnKeyType="send" accessibilityLabel="Type a message"
            style={{ fontSize: 14, color: colors.text, height: '100%', ...({ outlineStyle: 'none' } as object) }}
          />
        </View>
        <Button label={wide ? 'Template' : ''} icon="file-text" onPress={() => setTplOpen(true)} disabled={current.optOut} style={!wide ? { paddingHorizontal: 12, height: 44 } : undefined} />
        <Pressable onPress={send} disabled={!draft.trim() || busy} accessibilityLabel="Send" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: draft.trim() && !busy ? 1 : 0.5 }}>
          <Icon name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </Card>
  ) : (
    <Card style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <Icon name="message-circle" size={40} color={colors.placeholder} />
      <T color={colors.muted}>Select a conversation to start</T>
    </Card>
  );


  return (
    <Shell title="WhatsApp Inbox" scroll={false}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 16, height: boxH, minHeight: 0 }}>
        {showList ? listPane : null}
        {showChat ? chatPane : null}
        {xl && panelOpen && current ? <Card style={{ width: 300, paddingVertical: 18 }}><Details c={current} onClose={() => setPanelOpen(false)} /></Card> : null}
      </View>

      <Sheet visible={tplOpen} onClose={() => setTplOpen(false)} title="Send the approved template">
        <View style={{ padding: 10, gap: 14 }}>
          {main.template ? (
            <>
              <T size={13} color={colors.muted}>{main.template.name} · {main.template.language}</T>
              <View style={{ backgroundColor: colors.bubbleOut, borderRadius: 12, padding: 12 }}><T size={13} style={{ lineHeight: 19 }}>{tplPreview}</T></View>
              <Button kind="primary" label={busy ? 'Sending…' : 'Send template'} icon="send" onPress={sendTemplate} disabled={busy} />
            </>
          ) : (
            <>
              <T color={colors.muted}>Choose an approved template in Settings first.</T>
              <Button label="Open Settings" onPress={() => { setTplOpen(false); go({ name: 'settings' }); }} />
            </>
          )}
        </View>
      </Sheet>

      <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="New chat">
        <View style={{ padding: 10, gap: 14 }}>
          <View style={{ gap: 8 }}>
            <T size={13} weight={font.medium}>Country</T>
            <Select
              value={cc} label="Country code" height={44} onChange={setCc}
              options={[...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag}  ${c.name}  (+${c.code})` })), { value: 'other', label: 'Other country code…' }]}
            />
          </View>
          {cc === 'other' ? <Field label="Country code" icon="globe" value={ccOther} onChangeText={(v) => setCcOther(v.replace(/\D/g, '').slice(0, 4))} keyboardType="phone-pad" placeholder="e.g. 49" /> : null}
          <Field label="Phone number" icon="phone" value={groupDigits(nat)} onChangeText={(v) => setNat(v.replace(/\D/g, ''))} keyboardType="phone-pad" placeholder="58 614 1832" hint="Without the country code. A leading 0 is removed for you." />
          <Field label="Name (optional)" icon="user" value={newName} onChangeText={setNewName} placeholder="Ali Jawad" />
          {code && nat ? (
            <View style={{ backgroundColor: colors.tint, borderRadius: 10, padding: 12, gap: 4 }}>
              <T size={12} color={colors.muted}>WhatsApp number</T>
              <T weight={font.semi}>+{code} {groupDigits(nat)}</T>
            </View>
          ) : null}
          <T size={12} color={colors.muted}>WhatsApp tells us if the number exists when the first message is sent. If it does not, the chat shows “Not on WhatsApp”.</T>
          <Button kind="primary" label={busy ? 'Please wait…' : 'Start chat'} icon="message-circle" onPress={startNew} disabled={busy || !code || !nat} />
        </View>
      </Sheet>

      <Sheet visible={infoOpen && !!current} onClose={() => setInfoOpen(false)} title="Patient details">
        <View style={{ padding: 10 }}>{current ? <Details c={current} /> : null}</View>
      </Sheet>
    </Shell>
  );
}
