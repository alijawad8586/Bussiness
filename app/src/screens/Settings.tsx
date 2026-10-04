import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, font, statusColors } from '../theme';
import { TEMPLATES } from '../data';
import { Button, Card, CardHeading, Icon, Select, Sheet, SheetIcon, T, Toggle, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { DEFAULT_COLUMNS, Settings as SettingsT, useStore } from '../store';

const SCHEDULES = ['Daily at 09:00', 'Daily at 12:00', 'Daily at 18:00', 'Weekly on Monday', 'Manual only'];
const SPEEDS = ['10 messages / minute', '20 messages / minute', '40 messages / minute', '60 messages / minute'];
const opt = (list: string[]) => list.map((v) => ({ value: v, label: v }));

const MAP_FIELDS: { key: keyof SettingsT['mapping']; label: string; required?: boolean }[] = [
  { key: 'phone', label: 'Phone number', required: true },
  { key: 'patient', label: 'Patient name' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'time', label: 'Appointment time' },
];

function ago(ts: number) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Reads a CSV's header and row count. Other file types keep the default columns. */
async function readCsv(uri: string) {
  const text = await (await fetch(uri)).text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const columns = (lines[0] ?? '').split(',').map((c) => c.replace(/^"|"$/g, '').trim()).filter(Boolean);
  return { columns, rows: Math.max(0, lines.length - 1) };
}

function guess(columns: string[], hints: string[], fallback: string) {
  return columns.find((c) => hints.some((h) => c.toLowerCase().includes(h))) ?? fallback;
}

export default function Settings() {
  const { settings, updateSettings, generateReport, go, showToast } = useStore();
  const { wide } = useLayout();
  const [draft, setDraft] = useState<SettingsT>(settings);
  const [confirm, setConfirm] = useState(false);

  const set = (patch: Partial<SettingsT>) => setDraft((d) => ({ ...d, ...patch }));
  /** Changes to the data source apply straight away (like a sync). */
  const applySource = (patch: Partial<SettingsT>) => { updateSettings(patch); set(patch); };

  const phoneOk = !!draft.mapping.phone && draft.columns.includes(draft.mapping.phone);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const tpl = TEMPLATES.find((t) => t.name === draft.template) ?? TEMPLATES[0];

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const f = res.assets[0];
      let columns = DEFAULT_COLUMNS;
      let rows = settings.rows;
      if (/\.csv$/i.test(f.name)) {
        const r = await readCsv(f.uri);
        if (r.columns.length) { columns = r.columns; rows = r.rows; }
      } else {
        showToast('Excel file added. Using default column names.');
      }
      applySource({
        source: 'upload', fileName: f.name, rows, columns, lastSynced: Date.now(),
        mapping: {
          phone: guess(columns, ['phone', 'mobile', 'number'], columns[0]),
          patient: guess(columns, ['name', 'patient'], columns[1] ?? columns[0]),
          doctor: guess(columns, ['doctor', 'dr'], columns[2] ?? columns[0]),
          time: guess(columns, ['time', 'date', 'appointment'], columns[3] ?? columns[0]),
        },
      });
      showToast(`${f.name} loaded · ${rows.toLocaleString()} rows`);
    } catch {
      showToast('Could not read that file');
    }
  };

  const connectSheet = () => {
    applySource({ source: 'sheet', fileName: 'Patients_Oct.gsheet', rows: 1248, columns: DEFAULT_COLUMNS, lastSynced: Date.now(), mapping: { phone: 'phone_number', patient: 'patient_name', doctor: 'doctor', time: 'appointment_time' } });
    showToast('Google Sheet connected');
  };

  const save = () => {
    if (!phoneOk) return showToast('Match the Phone number column first');
    if (!dirty) return showToast('No changes to save');
    updateSettings(draft);
    showToast('Settings saved');
  };

  const sendNow = () => {
    updateSettings(draft);
    setConfirm(false);
    const r = generateReport(draft.template);
    showToast(`Sending ${draft.template} to ${draft.rows.toLocaleString()} numbers`);
    go({ name: 'report', id: r.id });
  };

  const SourceOption = ({ active, icon, title, sub, onPress }: { active: boolean; icon: React.ReactNode; title: string; sub: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 12, padding: active ? 15 : 16, borderRadius: 10, borderWidth: active ? 2 : 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.tint : '#fff' }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primary : colors.bg }}>{icon}</View>
      <View style={{ flex: 1 }}><T weight={font.semi}>{title}</T><T size={12} color={colors.muted}>{sub}</T></View>
    </Pressable>
  );

  const ToggleRow = ({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}><T weight={font.medium}>{title}</T><T size={12} color={colors.muted}>{sub}</T></View>
      <Toggle value={value} onChange={onChange} />
    </View>
  );

  const colOptions = draft.columns.map((c) => ({ value: c, label: c }));

  return (
    <Shell title="Settings" subtitle="Patient data, approved template and automatic sending">
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 20 }}>
          <Card style={{ gap: 18 }}>
            <CardHeading title="Patient data source" sub="Connect a Google Sheet or upload a spreadsheet that has your patients’ phone numbers." />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <SourceOption active={draft.source === 'sheet'} icon={<SheetIcon color={draft.source === 'sheet' ? '#fff' : colors.muted} />} title="Connect Google Sheet" sub="Auto-sync new rows" onPress={connectSheet} />
              <SourceOption active={draft.source === 'upload'} icon={<Icon name="upload" size={20} color={draft.source === 'upload' ? '#fff' : colors.muted} />} title="Upload spreadsheet" sub=".xlsx or .csv file" onPress={pickFile} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
              <SheetIcon size={22} />
              <View style={{ flex: 1, minWidth: 160 }}>
                <T weight={font.semi} numberOfLines={1}>{settings.fileName}</T>
                <T size={12} color={colors.muted}>{`${settings.rows.toLocaleString()} rows · Last synced ${ago(settings.lastSynced)}`}</T>
              </View>
              <Button label="Sync now" icon="refresh-cw" onPress={() => { applySource({ lastSynced: Date.now() }); showToast('Sheet synced'); }} />
            </View>
          </Card>

          <Card style={{ gap: 16 }}>
            <CardHeading title="Match your columns" sub="Tell CareReach which sheet column holds each patient detail." />
            {MAP_FIELDS.map((f) => (
              <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Select label={`${f.label} column`} value={draft.mapping[f.key]} options={colOptions} onChange={(v) => set({ mapping: { ...draft.mapping, [f.key]: v } })} />
                </View>
                <Icon name="arrow-right" size={16} />
                <View style={{ width: wide ? 220 : 110, gap: 2 }}>
                  <T size={13} weight={font.medium}>{f.label}</T>
                  <T size={11} weight={font.medium} color={f.required ? colors.danger : colors.muted}>{f.required ? 'Required' : 'Used in message'}</T>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: phoneOk ? statusColors.Delivered.bg : statusColors.Failed.bg }}>
              <Icon name={phoneOk ? 'check' : 'alert-circle'} size={16} color={phoneOk ? statusColors.Delivered.fg : statusColors.Failed.fg} />
              <T size={13} weight={font.medium} color={phoneOk ? statusColors.Delivered.fg : statusColors.Failed.fg}>
                {phoneOk ? 'All required columns are matched' : 'Choose the column that holds phone numbers'}
              </T>
            </View>
          </Card>
        </View>

        <View style={{ width: wide ? 460 : '100%', gap: 20 }}>
          <Card style={{ gap: 16 }}>
            <CardHeading title="Approved message template" sub="Only templates approved by WhatsApp can be sent." />
            <Select
              label="Approved message template"
              height={48}
              value={draft.template}
              onChange={(v) => set({ template: v })}
              options={TEMPLATES.map((t) => ({ value: t.name, label: t.name, sub: t.meta }))}
              renderValue={(o) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="file-text" size={16} color={colors.primary} />
                  <T weight={font.semi} numberOfLines={1} style={{ flexShrink: 1 }}>{o.label}</T>
                  <View style={{ backgroundColor: statusColors.Delivered.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11} weight={font.semi} color={statusColors.Delivered.fg}>Approved</T></View>
                </View>
              )}
            />
            <View style={{ backgroundColor: colors.chatBg, borderRadius: 10, padding: 14, gap: 8 }}>
              <T size={11} weight={font.semi} color={colors.muted}>PREVIEW</T>
              <View style={{ backgroundColor: colors.bubbleOut, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <T size={13} style={{ lineHeight: 19 }}>{tpl.body}</T>
              </View>
            </View>
          </Card>

          <Card style={{ gap: 18 }}>
            <CardHeading title="Automatic sending" sub="Send the approved template to every number in the sheet." />
            <ToggleRow title="Send automatically" sub="Message each phone number in the selected sheet" value={draft.autoSend} onChange={(v) => set({ autoSend: v })} />
            <ToggleRow title="Check numbers on WhatsApp first" sub="Mark numbers without WhatsApp instead of failing" value={draft.checkNumbers} onChange={(v) => set({ checkNumbers: v })} />
            <ToggleRow title="Retry failed messages once" sub="Try again after 15 minutes" value={draft.retry} onChange={(v) => set({ retry: v })} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}><T size={12} weight={font.medium} color={colors.muted}>Schedule</T><Select label="Schedule" value={draft.schedule} options={opt(SCHEDULES)} onChange={(v) => set({ schedule: v })} /></View>
              <View style={{ flex: 1, gap: 6 }}><T size={12} weight={font.medium} color={colors.muted}>Sending speed</T><Select label="Sending speed" value={draft.speed} options={opt(SPEEDS)} onChange={(v) => set({ speed: v })} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="primary" label="Save settings" onPress={save} flex />
              <Button label="Send now" icon="zap" onPress={() => (phoneOk ? setConfirm(true) : showToast('Match the Phone number column first'))} />
            </View>
          </Card>
        </View>
      </View>

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Send now?">
        <View style={{ padding: 10, gap: 16 }}>
          <T color={colors.muted} style={{ lineHeight: 21 }}>
            {`This will send “${draft.template}” to ${draft.rows.toLocaleString()} numbers from ${draft.fileName}.`}
          </T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancel" onPress={() => setConfirm(false)} flex />
            <Button kind="primary" label="Send now" icon="zap" onPress={sendNow} flex />
          </View>
        </View>
      </Sheet>
    </Shell>
  );
}
