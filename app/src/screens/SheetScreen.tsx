import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { colors, font } from '../theme';
import { Button, Card, T } from '../components/ui';
import { Shell } from '../components/Shell';
import { pickSheet } from '../sheet';
import { useStore } from '../store';

export default function SheetScreen() {
  const { sheet, setSheet, go, showToast } = useStore();
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    setBusy(true);
    try {
      const s = await pickSheet();
      if (s) {
        setSheet(s);
        showToast(`${s.name} loaded · ${s.rows.length - 1} rows`);
      }
    } catch {
      showToast('Could not read that file. Try a CSV or Excel file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Upload Sheet" subtitle="Upload a CSV or Excel (.xlsx / .xls) file. Agent AI can answer questions about this data.">
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button kind="primary" icon="upload" label={busy ? 'Reading…' : sheet ? 'Replace file' : 'Choose file'} onPress={upload} disabled={busy} />
          {sheet ? <Button label="Remove" onPress={() => setSheet(null)} /> : null}
          {sheet ? <Button label="Ask Agent AI" icon="cpu" onPress={() => go({ name: 'agent' })} /> : null}
        </View>
        <T size={13} color={colors.muted}>
          {sheet ? `${sheet.name} — ${sheet.rows.length - 1} rows (first 50 shown)` : 'No sheet uploaded yet.'}
        </T>
      </Card>

      {sheet ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ScrollView horizontal>
            <View>
              {sheet.rows.slice(0, 51).map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', backgroundColor: i === 0 ? colors.tableHead : '#fff', borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  {row.map((cell, c) => (
                    <View key={c} style={{ width: 150, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <T size={13} weight={i === 0 ? font.semi : font.regular} color={i === 0 ? colors.muted : colors.text} numberOfLines={1}>{cell}</T>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </Card>
      ) : null}
    </Shell>
  );
}
