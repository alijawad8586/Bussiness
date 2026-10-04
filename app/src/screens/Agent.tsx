import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { colors, font } from '../theme';
import { callAI, systemPrompt } from '../ai';
import { Button, Card, Icon, Select, T, Toggle, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { useStore } from '../store';

export default function Agent() {
  const { providers, aiKeys, sheet, chat, setChat, go } = useStore();
  const { wide, height } = useLayout();
  const ready = providers.filter((p) => aiKeys[p.id]);
  const [providerId, setProviderId] = useState(ready[0]?.id ?? '');
  const [useSheet, setUseSheet] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Keep the selection valid if keys are added or removed.
  useEffect(() => {
    if (!ready.some((p) => p.id === providerId)) setProviderId(ready[0]?.id ?? '');
  }, [ready, providerId]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [chat.length]);

  const send = async () => {
    const text = draft.trim();
    const p = ready.find((x) => x.id === providerId);
    if (!text || !p || busy) return;
    const user = { id: `u${Date.now()}`, role: 'user' as const, text };
    const convo = [...chat.filter((m) => !m.error), user];
    setChat((c) => [...c, user]);
    setDraft('');
    setBusy(true);
    try {
      const reply = await callAI(p, aiKeys[p.id], convo, systemPrompt(sheet, useSheet));
      setChat((c) => [...c, { id: `b${Date.now()}`, role: 'bot', text: reply }]);
    } catch (e) {
      setChat((c) => [...c, { id: `e${Date.now()}`, role: 'bot', text: `Error: ${e instanceof Error ? e.message : 'request failed'}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const boxH = Math.max(420, height - (wide ? 190 : 230));

  return (
    <Shell title="Agent AI" subtitle="Ask questions about your patients and messages." scroll={false}>
      {!ready.length ? (
        <Card style={{ alignItems: 'center', gap: 12, padding: 32 }}>
          <Icon name="key" size={32} color={colors.placeholder} />
          <T color={colors.muted} style={{ textAlign: 'center' }}>Add an AI key first (ChatGPT, Gemini, Claude, Groq…).</T>
          <Button kind="primary" label="Open API Cloud" onPress={() => go({ name: 'api' })} />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden', height: boxH }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ width: 220 }}>
              <Select label="AI provider" value={providerId} options={ready.map((p) => ({ value: p.id, label: p.name }))} onChange={setProviderId} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Toggle value={useSheet} onChange={setUseSheet} />
              <T size={13}>{sheet ? `Use ${sheet.name}` : 'Use uploaded sheet (none yet)'}</T>
            </View>
            <View style={{ flex: 1 }} />
            <Button label="Clear chat" onPress={() => setChat([])} style={{ paddingVertical: 8 }} />
          </View>

          <FlatList
            ref={listRef}
            data={chat}
            keyExtractor={(m) => m.id}
            style={{ flex: 1, backgroundColor: colors.chatBg }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            ListEmptyComponent={<T color={colors.muted} style={{ textAlign: 'center', paddingTop: 40 }}>Type a question below to start.</T>}
            renderItem={({ item: m }) => (
              <View style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '85%', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: m.error ? '#fee2e2' : m.role === 'user' ? colors.bubbleOut : '#fff' }}>
                  <T size={14} color={m.error ? colors.danger : colors.text} style={{ lineHeight: 20 }}>{m.text}</T>
                </View>
              </View>
            )}
            ListFooterComponent={busy ? <T size={13} color={colors.muted} style={{ paddingTop: 8 }}>Thinking…</T> : null}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.bg, paddingHorizontal: 14, justifyContent: 'center' }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={send}
                placeholder="Ask anything…"
                placeholderTextColor={colors.placeholder}
                returnKeyType="send"
                accessibilityLabel="Ask the agent"
                style={{ fontSize: 14, color: colors.text, height: '100%', ...({ outlineStyle: 'none' } as object) }}
              />
            </View>
            <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityLabel="Send" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !draft.trim() ? 0.5 : 1 }}>
              <Icon name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </Card>
      )}
    </Shell>
  );
}
