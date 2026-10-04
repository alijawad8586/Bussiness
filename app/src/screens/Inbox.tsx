import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, font } from '../theme';
import { Conversation, TEMPLATES, APPOINTMENT, fillTemplate } from '../data';
import { Avatar, Card, CountBadge, Empty, Icon, Chip, SearchBox, Sheet, StatusBadge, T, Ticks, Button, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { useStore } from '../store';

type Tab = 'All' | 'Unread' | 'Failed';

function Preview({ c }: { c: Conversation }) {
  const last = c.chats[c.chats.length - 1];
  const failed = last.dir === 'out' && c.status === 'Failed' && c.chats.length === 1;
  const color = failed ? colors.danger : colors.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
      {last.dir === 'out' ? (failed ? <Icon name="x-circle" size={15} color={colors.danger} /> : <Ticks read={last.read} />) : null}
      <T size={13} color={color} numberOfLines={1} style={{ flex: 1 }}>{last.text}</T>
    </View>
  );
}

function ConversationRow({ c, active, onPress }: { c: Conversation; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: active ? colors.tintSoft : '#fff' }}>
      <Avatar name={c.name} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T weight={font.semi} numberOfLines={1} style={{ flex: 1 }}>{c.name}</T>
          <T size={12} weight={c.unread ? font.medium : font.regular} color={c.unread ? colors.primary : colors.muted}>{c.time}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Preview c={c} />
          {c.unread ? <CountBadge n={c.unread} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Details({ c, onViewMessages }: { c: Conversation; onViewMessages: () => void }) {
  const rows: [string, string][] = [
    ['Doctor', c.doctor], ['Last template', c.template], ['Sent at', c.sentAt], ['Source', `Patients_Oct.gsheet · row ${c.row}`],
  ];
  return (
    <View style={{ gap: 18, flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={c.name} size={64} />
        <T size={17} weight={font.semi}>{c.name}</T>
        <T size={13} color={colors.muted}>{c.phone}</T>
      </View>
      {rows.slice(0, 3).map(([k, v]) => (
        <View key={k} style={{ gap: 5 }}><T size={12} weight={font.medium} color={colors.muted}>{k}</T><T weight={font.medium}>{v}</T></View>
      ))}
      <View style={{ gap: 5 }}><T size={12} weight={font.medium} color={colors.muted}>Delivery status</T><StatusBadge status={c.status} /></View>
      <View style={{ gap: 5 }}><T size={12} weight={font.medium} color={colors.muted}>{rows[3][0]}</T><T weight={font.medium}>{rows[3][1]}</T></View>
      <View style={{ flex: 1 }} />
      <Button label="View in Messages" icon="chevron-right" onPress={onViewMessages} />
    </View>
  );
}

export default function Inbox({ openId }: { openId?: string }) {
  const { convs, openConversation, sendChat, go, showToast, unreadCount } = useStore();
  const { wide, xl, height } = useLayout();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('All');
  const [selected, setSelected] = useState<string | null>(openId ?? (wide ? convs[0]?.id ?? null : null));
  const [draft, setDraft] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  const current = convs.find((c) => c.id === selected) ?? null;

  // Opening a chat marks it read.
  useEffect(() => {
    if (selected) openConversation(selected);
  }, [selected, openConversation]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [current?.chats.length, selected]);

  const counts = useMemo(() => ({
    All: convs.length,
    Unread: convs.filter((c) => c.unread > 0).length,
    Failed: convs.filter((c) => c.status === 'Failed').length,
  }), [convs]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return convs.filter((c) =>
      (tab === 'All' || (tab === 'Unread' ? c.unread > 0 : c.status === 'Failed')) &&
      (!q || c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
  }, [convs, query, tab]);

  const send = () => {
    const text = draft.trim();
    if (!current || !text) return;
    sendChat(current.id, text);
    setDraft('');
  };

  const sendTemplate = (name: string) => {
    if (!current) return;
    const t = TEMPLATES.find((x) => x.name === name)!;
    sendChat(current.id, fillTemplate(t.body, { patient_name: current.name.split(' ')[0], doctor: current.doctor, appointment_time: APPOINTMENT }), name);
    setTplOpen(false);
    showToast(`Template sent: ${name}`);
  };

  const showList = wide || !current;
  const showChat = wide || !!current;
  const boxH = wide ? Math.max(520, height - 190) : undefined;

  const listPane = (
    <Card style={{ padding: 0, overflow: 'hidden', width: wide ? 360 : undefined, flex: wide ? undefined : 1 }}>
      <View style={{ padding: 16, gap: 12 }}>
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search patient or phone number" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['All', 'Unread', 'Failed'] as Tab[]).map((t) => <Chip key={t} label={`${t} ${counts[t]}`} active={tab === t} onPress={() => setTab(t)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationRow c={item} active={item.id === selected} onPress={() => setSelected(item.id)} />}
        ListEmptyComponent={<Empty text="No conversations found." />}
        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
      />
    </Card>
  );

  const chatPane = current ? (
    <Card style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {!wide ? <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Back to conversations"><Icon name="arrow-left" size={22} color={colors.text} /></Pressable> : null}
        <Avatar name={current.name} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15} weight={font.semi} numberOfLines={1}>{current.name}</T>
          <T size={12} color={colors.muted} numberOfLines={1}>{current.phone}  ·  Patient of {current.doctor}</T>
        </View>
        {wide ? <StatusBadge status={current.status} /> : null}
        {!xl ? <Pressable onPress={() => setInfoOpen(true)} hitSlop={10} accessibilityLabel="Patient details"><Icon name="info" size={20} color={colors.muted} /></Pressable> : null}
      </View>

      <FlatList
        ref={listRef}
        data={current.chats}
        keyExtractor={(m) => m.id}
        style={{ flex: 1, backgroundColor: colors.chatBg }}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        ListHeaderComponent={<View style={{ alignItems: 'center' }}><View style={{ backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 }}><T size={12} weight={font.medium} color={colors.muted}>Today</T></View></View>}
        renderItem={({ item: m }) => {
          const out = m.dir === 'out';
          const failed = out && current.status === 'Failed' && m.template && current.chats[0].id === m.id;
          return (
            <View style={{ alignItems: out ? 'flex-end' : 'flex-start' }}>
              <View style={{ maxWidth: '85%', backgroundColor: out ? colors.bubbleOut : '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
                {m.template ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="file-text" size={12} color={colors.primary} />
                    <T size={11} weight={font.medium} color={colors.primary}>Template · {m.template}</T>
                  </View>
                ) : null}
                <T size={14} style={{ lineHeight: 20 }}>{m.text}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <T size={11} color={colors.muted}>{m.time}</T>
                  {out ? (failed ? <Icon name="x-circle" size={14} color={colors.danger} /> : <Ticks read={m.read} size={14} />) : null}
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' }}>
        <View style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.bg, paddingHorizontal: 14, justifyContent: 'center' }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Type a message…"
            placeholderTextColor={colors.placeholder}
            returnKeyType="send"
            accessibilityLabel="Type a message"
            style={{ fontSize: 14, color: colors.text, height: '100%', ...({ outlineStyle: 'none' } as object) }}
          />
        </View>
        <Button label={wide ? 'Template' : ''} icon="file-text" onPress={() => setTplOpen(true)} style={!wide ? { paddingHorizontal: 12, height: 44 } : undefined} />
        <Pressable onPress={send} disabled={!draft.trim()} accessibilityLabel="Send" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: draft.trim() ? 1 : 0.5 }}>
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

  const details = current ? <Details c={current} onViewMessages={() => go({ name: 'messages', query: current.phone })} /> : null;

  return (
    <Shell title="WhatsApp Inbox" subtitle={`Send and receive patient messages · ${unreadCount} unread`} scroll={false}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 16, height: boxH, minHeight: 0 }}>
        {showList ? listPane : null}
        {showChat ? chatPane : null}
        {xl && current ? <Card style={{ width: 280, paddingVertical: 22 }}>{details}</Card> : null}
      </View>

      <Sheet visible={tplOpen} onClose={() => setTplOpen(false)} title="Send an approved template">
        {TEMPLATES.map((t) => (
          <Pressable key={t.name} onPress={() => sendTemplate(t.name)} style={{ padding: 14, borderRadius: 10, gap: 6, backgroundColor: colors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T weight={font.semi}>{t.name}</T>
              <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11} weight={font.semi} color="#15803d">Approved</T></View>
            </View>
            <T size={12} color={colors.muted}>{t.body}</T>
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={infoOpen && !!current} onClose={() => setInfoOpen(false)} title="Patient details">
        <View style={{ padding: 10 }}>{current ? <Details c={current} onViewMessages={() => { setInfoOpen(false); go({ name: 'messages', query: current.phone }); }} /> : null}</View>
      </Sheet>
    </Shell>
  );
}
