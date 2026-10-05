import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { colors, font, statusColors } from '../theme';
import { api } from '../api';
import { WEBHOOK_URL } from '../firebase';
import { pickSheet, PickedSheet } from '../sheet';
import { renderBody } from '../template';
import { Button, Card, CardHeading, Chip, Icon, Input, Select, Sheet, SheetIcon, T, Toggle, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { ImportResult, MainSettings, TemplateRef } from '../types';
import { useStore } from '../store';

const SPEEDS = [10, 20, 40, 60];
const PROVIDERS = [
  { value: 'gemini', label: 'Gemini (Google)', model: 'gemini-2.5-flash' },
  { value: 'openai', label: 'ChatGPT (OpenAI)', model: 'gpt-4o-mini' },
  { value: 'anthropic', label: 'Claude (Anthropic)', model: 'claude-haiku-4-5-20251001' },
  { value: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile' },
  { value: 'custom', label: 'Other (OpenAI-compatible)', model: '' },
];

const tplKey = (t: TemplateRef) => `${t.name}|${t.language}`;

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

/** Shows whether WhatsApp can reach us (replies and delivery receipts), and how to fix it when it cannot. */
function WebhookBox() {
  const { server, showToast } = useStore();
  const [busy, setBusy] = useState(false);
  const last = server.webhook?.lastAt?.toMillis?.() ?? 0;
  const subscribed = server.whatsapp?.webhookSubscribed;
  const recheck = async () => {
    setBusy(true);
    try {
      const r = await api.subscribeWebhook();
      showToast(r.ok ? 'Done. WhatsApp will now send replies and receipts to this app.' : `WhatsApp refused: ${r.error ?? 'unknown reason'}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not check');
    } finally {
      setBusy(false);
    }
  };
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <T size={12} color={colors.muted} style={{ lineHeight: 18 }}>{n}. {children}</T>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: last ? colors.green : '#f59e0b' }} />
        <T size={13} weight={font.semi}>{last ? `Receiving works · last event ${ago(last)}` : 'No event from WhatsApp received yet'}</T>
      </View>
      {subscribed === false ? <T size={12} color={colors.danger}>WhatsApp did not accept this app for your account{server.whatsapp?.subscribeError ? `: ${server.whatsapp.subscribeError}` : ''}.</T> : null}
      {!last ? (
        <>
          <T size={12} color={colors.muted}>To receive patient replies and delivery status, set this in Meta (your app → WhatsApp → Configuration → Webhook):</T>
          <Step n={1}>Callback URL:</Step>
          <Text selectable style={{ fontSize: 12, color: colors.dark, backgroundColor: colors.tint, padding: 10, borderRadius: 8 }}>{WEBHOOK_URL}</Text>
          <Step n={2}>Verify token: the same text as WA_VERIFY_TOKEN in your Vercel settings. Click “Verify and save”.</Step>
          <Step n={3}>Under “Webhook fields”, tick “messages” (Subscribe).</Step>
          <Step n={4}>Send a WhatsApp message from an allowed phone to your test number. This box turns green when it arrives.</Step>
        </>
      ) : null}
      <Button label={busy ? 'Checking…' : 'Check and fix receiving'} icon="refresh-cw" onPress={recheck} disabled={busy} />
    </View>
  );
}

export default function Settings({ initialTab = 'source' }: { initialTab?: 'source' | 'agent' }) {
  const { go, user, logOut, consent, openPrivacy } = useStore();
  const { wide } = useLayout();
  const [tab, setTab] = useState<'source' | 'agent'>(initialTab);

  return (
    <Shell title="Settings" subtitle="Patient source and AI agent">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Patient source" active={tab === 'source'} onPress={() => setTab('source')} />
        <Chip label="AI Agent" active={tab === 'agent'} onPress={() => setTab('agent')} />
      </View>
      {tab === 'source' ? <SourceTab /> : <AgentTab />}

      <Card style={{ gap: 12, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T weight={font.semi}>{user?.name}</T>
          <T size={13} color={colors.muted}>{user?.email}</T>
          <T size={12} color={colors.primary} onPress={openPrivacy}>{`Privacy Policy${consent?.acceptedAt ? ` · accepted ${new Date(consent.acceptedAt).toLocaleDateString()}` : ''}`}</T>
        </View>
        <Button label="Reconnect WhatsApp" icon="link" onPress={() => go({ name: 'connect' })} />
        <Button label="Log out" icon="log-out" onPress={logOut} />
      </Card>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 1: patient source                                               */
/* ------------------------------------------------------------------ */

function SourceTab() {
  const { main, saveMain, server, lastSheet, go, showToast } = useStore();
  const { wide } = useLayout();
  const [draft, setDraft] = useState<MainSettings>(main);
  const [dirty, setDirty] = useState(false);
  const [file, setFile] = useState<PickedSheet | null>(null);
  const [templates, setTemplates] = useState<TemplateRef[]>([]);
  const [tplState, setTplState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [tplError, setTplError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => { if (!dirty) setDraft(main); }, [main, dirty]);
  const edit = (patch: Partial<MainSettings>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const connected = !!server.whatsapp?.connected;
  const columns = file?.columns ?? lastSheet?.columns ?? [];
  const colOptions = columns.map((c) => ({ value: c, label: c }));
  const optional = [{ value: '', label: 'Not used' }, ...colOptions];

  const loadTemplates = async () => {
    setTplState('loading'); setTplError('');
    try {
      setTemplates((await api.listTemplates()).templates);
      setTplState('idle');
    } catch (e) {
      setTplState('error');
      setTplError(e instanceof Error ? e.message : 'Could not load templates');
    }
  };
  useEffect(() => { if (connected) loadTemplates(); }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const tplOptions = useMemo(() => {
    const list = [...templates];
    if (draft.template && !list.some((t) => tplKey(t) === tplKey(draft.template!))) list.unshift(draft.template);
    return list.map((t) => ({ value: tplKey(t), label: t.name, sub: `${t.language} · ${t.variableCount} variable${t.variableCount === 1 ? '' : 's'}` }));
  }, [templates, draft.template]);

  const chooseTemplate = (key: string) => {
    const t = [...templates, ...(draft.template ? [draft.template] : [])].find((x) => tplKey(x) === key);
    if (!t) return;
    // guess: {{1}} = patient, {{2}} = doctor, the rest = the next unused columns
    const used = new Set<string>();
    const guess = [draft.mapping.patientCol, draft.mapping.doctorCol];
    const varCols = Array.from({ length: t.variableCount }, (_, i) => {
      const pick = (guess[i] && columns.includes(guess[i]) ? guess[i] : columns.find((c) => !used.has(c) && c !== draft.mapping.phoneCol)) ?? '';
      used.add(pick);
      return pick;
    });
    edit({ template: t, varCols });
  };

  const chooseFile = async () => {
    try {
      const f = await pickSheet();
      if (!f) return;
      setFile(f); setResult(null);
      // pre-select obvious columns
      const find = (...h: string[]) => f.columns.find((c) => h.some((x) => c.toLowerCase().includes(x))) ?? '';
      const next = { phoneCol: find('phone', 'mobile', 'number', 'cell'), patientCol: find('name', 'patient'), doctorCol: find('doctor', 'dr') };
      edit({ mapping: { ...draft.mapping, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v)) } as MainSettings['mapping'] });
      showToast(`${f.name} loaded · ${f.rows.length - 1} rows`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const tpl = draft.template;
  const problems: string[] = [];
  if (!connected) problems.push('Connect WhatsApp first.');
  if (!draft.mapping.phoneCol) problems.push('Choose the phone number column.');
  if (!tpl) problems.push('Choose an approved template.');
  else if (draft.varCols.length !== tpl.variableCount || draft.varCols.some((c) => !c)) problems.push('Choose a column for every template variable.');

  const save = async () => {
    try {
      await saveMain(draft);
      setDirty(false);
      showToast('Settings saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const upload = async () => {
    if (!file) return showToast('Choose a file first.');
    if (problems.length) return showToast(problems[0]);
    setBusy(true); setResult(null);
    try {
      await saveMain(draft);
      setDirty(false);
      const r = await api.importSheet({ fileName: file.name, rows: file.rows });
      setResult(r);
      if (r.campaign) {
        showToast(`${r.created + r.updated} contacts saved · sending ${r.campaign.total} messages`);
        go({ name: 'report', id: r.campaign.campaignId });
      } else {
        showToast(`${r.created + r.updated} contacts saved`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const sendAgain = async () => {
    if (!lastSheet) return;
    setBusy(true); setConfirmSend(false);
    try {
      await saveMain(draft);
      setDirty(false);
      const r = await api.startCampaign({ sheetId: lastSheet.id });
      showToast(`Sending ${r.total} messages`);
      go({ name: 'report', id: r.campaignId });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start sending');
    } finally {
      setBusy(false);
    }
  };

  const mapRow = (label: string, key: keyof MainSettings['mapping'], required?: boolean) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: wide ? 150 : 110, gap: 2 }}>
        <T size={13} weight={font.medium}>{label}</T>
        <T size={11} weight={font.medium} color={required ? colors.danger : colors.muted}>{required ? 'Required' : 'Optional'}</T>
      </View>
      <Icon name="arrow-left" size={16} />
      <View style={{ flex: 1 }}>
        <Select label={`${label} column`} value={draft.mapping[key]} options={required ? colOptions : optional} onChange={(v) => edit({ mapping: { ...draft.mapping, [key]: v } })} />
      </View>
    </View>
  );

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
      <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 20 }}>
        <Card style={{ gap: 14 }}>
          <CardHeading title="Patient data source" sub="Upload a CSV or Excel file with your patients’ phone numbers." />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
            <SheetIcon size={22} />
            <View style={{ flex: 1, minWidth: 160 }}>
              <T weight={font.semi} numberOfLines={1}>{file ? file.name : lastSheet ? lastSheet.fileName : 'No file yet'}</T>
              <T size={12} color={colors.muted}>
                {file ? `${(file.rows.length - 1).toLocaleString()} rows ready to upload` : lastSheet ? `${lastSheet.rows.toLocaleString()} rows · ${lastSheet.created} new, ${lastSheet.updated} updated, ${lastSheet.skipped} skipped` : '.xlsx or .csv'}
              </T>
            </View>
            <Button label={file || lastSheet ? 'Choose another file' : 'Upload sheet'} icon="upload" onPress={chooseFile} />
          </View>
          {result && (result.skipped > 0 || result.duplicates > 0) ? (
            <View style={{ backgroundColor: '#fef3c7', borderRadius: 8, padding: 12, gap: 4 }}>
              <T size={13} weight={font.semi} color="#b45309">{result.skipped} row{result.skipped === 1 ? '' : 's'} skipped{result.duplicates ? `, ${result.duplicates} duplicate number${result.duplicates === 1 ? '' : 's'}` : ''}</T>
              {result.errors.slice(0, 5).map((e) => <T key={e.row} size={12} color="#b45309">Row {e.row}: {e.reason}</T>)}
            </View>
          ) : null}
          {result?.sendError ? <View style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 12 }}><T size={13} color={colors.danger}>Contacts were saved, but sending did not start: {result.sendError}</T></View> : null}
        </Card>

        <Card style={{ gap: 16 }}>
          <CardHeading title="Match your columns" sub="Tell CareReach which column holds each detail." />
          {columns.length ? (
            <>
              {mapRow('Phone number', 'phoneCol', true)}
              {mapRow('Patient name', 'patientCol')}
              {mapRow('Doctor', 'doctorCol')}
            </>
          ) : <T color={colors.muted}>Upload a sheet to choose columns.</T>}
        </Card>
      </View>

      <View style={{ width: wide ? 460 : '100%', gap: 20 }}>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? colors.green : '#ef4444' }} />
            <T weight={font.semi}>{connected ? `WhatsApp connected · ${server.whatsapp?.displayNumber ?? ''}` : 'WhatsApp is not connected'}</T>
          </View>
          {connected ? <WebhookBox /> : null}
        </Card>

        <Card style={{ gap: 16 }}>
          <CardHeading title="Approved message template" sub="Only templates approved by WhatsApp can be sent." />
          {tplOptions.length ? (
            <Select label="Approved message template" height={48} value={tpl ? tplKey(tpl) : ''} options={tplOptions} onChange={chooseTemplate}
              renderValue={(o) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="file-text" size={16} color={colors.primary} />
                  <T weight={font.semi} numberOfLines={1} style={{ flexShrink: 1 }}>{o.label}</T>
                  <View style={{ backgroundColor: statusColors.Delivered.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11} weight={font.semi} color={statusColors.Delivered.fg}>Approved</T></View>
                </View>
              )} />
          ) : (
            <T color={tplState === 'error' ? colors.danger : colors.muted}>{tplState === 'loading' ? 'Loading your approved templates…' : tplState === 'error' ? tplError : connected ? 'No approved templates found in your WhatsApp account.' : 'Connect WhatsApp to load templates.'}</T>
          )}
          {connected ? <T size={12} weight={font.medium} color={colors.primary} onPress={loadTemplates}>Refresh templates</T> : null}

          {tpl ? (
            <>
              <View style={{ backgroundColor: colors.chatBg, borderRadius: 10, padding: 14, gap: 8 }}>
                <T size={11} weight={font.semi} color={colors.muted}>PREVIEW</T>
                <View style={{ backgroundColor: colors.bubbleOut, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <T size={13} style={{ lineHeight: 19 }}>{renderBody(tpl.body, draft.varCols.map((c) => (file?.rows[1]?.[file.columns.indexOf(c)] ?? (c ? `[${c}]` : ''))))}</T>
                </View>
              </View>
              {Array.from({ length: tpl.variableCount }, (_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <T size={13} weight={font.semi} style={{ width: 52 }}>{`{{${i + 1}}}`}</T>
                  <Icon name="arrow-left" size={16} />
                  <View style={{ flex: 1 }}>
                    <Select label={`Variable ${i + 1}`} value={draft.varCols[i] ?? ''} options={colOptions.length ? colOptions : [{ value: '', label: 'Upload a sheet first' }]} onChange={(v) => { const next = [...draft.varCols]; next[i] = v; edit({ varCols: next }); }} />
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </Card>

        <Card style={{ gap: 18 }}>
          <CardHeading title="Sending" sub="Messages go out one by one to every number in the sheet." />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight={font.medium}>Send automatically after upload</T>
              <T size={12} color={colors.muted}>Off = only save the contacts</T>
            </View>
            <Toggle value={draft.autoSend} onChange={(v) => edit({ autoSend: v })} />
          </View>
          <View style={{ gap: 6 }}>
            <T size={12} weight={font.medium} color={colors.muted}>Sending speed</T>
            <Select label="Sending speed" value={String(draft.speed)} options={SPEEDS.map((n) => ({ value: String(n), label: `${n} messages / minute` }))} onChange={(v) => edit({ speed: Number(v) })} />
          </View>
          {problems.length && file ? <T size={12} color={colors.danger}>{problems[0]}</T> : null}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button label="Save settings" onPress={save} disabled={busy || !dirty} flex />
            <Button kind="primary" label={busy ? 'Working…' : draft.autoSend ? 'Upload & send' : 'Upload contacts'} icon="upload-cloud" onPress={upload} disabled={busy || !file} flex />
          </View>
          {lastSheet && !file ? <Button label="Send template to the last uploaded sheet" icon="zap" onPress={() => (problems.length ? showToast(problems[0]) : setConfirmSend(true))} disabled={busy} /> : null}
        </Card>
      </View>

      <Sheet visible={confirmSend} onClose={() => setConfirmSend(false)} title="Send now?">
        <View style={{ padding: 10, gap: 16 }}>
          <T color={colors.muted} style={{ lineHeight: 21 }}>{`This sends “${draft.template?.name}” to every patient in ${lastSheet?.fileName} (people who opted out are skipped).`}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancel" onPress={() => setConfirmSend(false)} flex />
            <Button kind="primary" label="Send now" icon="zap" onPress={sendAgain} flex />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 2: AI agent                                                     */
/* ------------------------------------------------------------------ */

function AgentTab() {
  const { server, main, showToast } = useStore();
  const { wide } = useLayout();
  const saved = server.agent;
  const [provider, setProvider] = useState(saved?.provider ?? 'gemini');
  const [key, setKey] = useState('');
  const [model, setModel] = useState(''); // optional: empty = chosen automatically
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [enabled, setEnabled] = useState(main.agentEnabled);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (saved) { setProvider(saved.provider); setBaseUrl(saved.baseUrl ?? ''); } }, [saved?.provider, saved?.baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setEnabled(main.agentEnabled), [main.agentEnabled]);

  const info = PROVIDERS.find((p) => p.value === provider)!;

  const save = async () => {
    if (!key.trim() && (!saved?.hasKey || saved.provider !== provider)) {
      setTestMsg({ ok: false, text: `Paste your ${info.label} API key.` });
      return false;
    }
    setBusy('save'); setTestMsg(null);
    try {
      const r = await api.saveAgent({ provider, apiKey: key.trim() || undefined, model: model.trim() || undefined, baseUrl: provider === 'custom' ? baseUrl.trim() : undefined, enabled });
      setKey(''); setModel('');
      setTestMsg({ ok: true, text: `${r.verified ? 'API key verified. ' : ''}Using model: ${r.model}${enabled ? '. The AI agent is on.' : '.'}` });
      return true;
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test'); setTestMsg(null);
    try {
      if (key.trim() && !(await save())) return;
      const r = await api.testAgent();
      setTestMsg({ ok: true, text: `Connected. The AI answered: “${r.reply}”` });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
      <Card style={{ gap: 16, flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
        <CardHeading title="AI provider" sub="Choose your AI and paste its API key. It is stored only on the server and never shown again." />
        <View style={{ gap: 6 }}>
          <T size={12} weight={font.medium} color={colors.muted}>Provider</T>
          <Select label="AI provider" value={provider} options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => { setProvider(v); setModel(''); setTestMsg(null); }} />
        </View>
        <View style={{ gap: 6 }}>
          <T size={12} weight={font.medium} color={colors.muted}>API key</T>
          <Input value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel="AI API key"
            placeholder={saved?.hasKey ? '•••••••• saved. Paste a new key to replace it' : 'Paste your API key'} />
        </View>
        {provider === 'custom' ? (
          <View style={{ gap: 6 }}>
            <T size={12} weight={font.medium} color={colors.muted}>API address</T>
            <Input value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} accessibilityLabel="API address" placeholder="https://api.deepseek.com/v1" />
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <T size={12} weight={font.medium} color={colors.muted}>Model (optional)</T>
          <Input value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} accessibilityLabel="AI model" placeholder={provider === 'custom' ? 'Model name (needed only if the provider has no model list)' : 'Leave empty: chosen automatically'} />
          {saved?.model && saved.provider === provider ? <T size={12} color={colors.muted}>Now using: {saved.model}</T> : null}
        </View>
        {testMsg ? <T size={13} color={testMsg.ok ? '#15803d' : colors.danger}>{testMsg.text}</T> : null}
        {saved?.lastError && !testMsg ? <T size={12} color={colors.danger}>Last AI error: {saved.lastError}</T> : null}
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button kind="primary" label={busy === 'save' ? 'Saving…' : 'Save'} onPress={save} disabled={!!busy} flex />
          <Button label={busy === 'test' ? 'Testing…' : 'Test connection'} icon="zap" onPress={test} disabled={!!busy || !(saved?.hasKey || key.trim())} />
        </View>
      </Card>

      <Card style={{ gap: 16, width: wide ? 460 : '100%' }}>
        <CardHeading title="Agent mode" sub="Let the AI answer patient messages automatically." />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight={font.medium}>Reply to patients automatically</T>
            <T size={12} color={colors.muted}>{saved?.hasKey ? 'Applies when you press Save' : 'Save an API key first'}</T>
          </View>
          <Toggle value={enabled} onChange={setEnabled} />
        </View>
        <View style={{ backgroundColor: colors.tint, borderRadius: 10, padding: 14, gap: 6 }}>
          <T size={13} weight={font.semi} color={colors.dark}>How the agent stays safe</T>
          {[
            'Only answers a message the patient just sent.',
            'Answers appointment and clinic questions. No medical advice.',
            'Emergency words go to your staff, not to the AI.',
            'STOP unsubscribes the patient immediately.',
            'At most 8 automatic replies per patient per hour.',
            'If the AI fails, the message stays unread for your staff.',
          ].map((t) => <T key={t} size={12} color={colors.dark}>• {t}</T>)}
        </View>
      </Card>
    </View>
  );
}
