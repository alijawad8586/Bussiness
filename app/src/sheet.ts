import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { Sheet } from './ai';

const MAX_ROWS = 2000;

/** Opens the file picker and parses a CSV or Excel file. Returns null if the user cancels. */
export async function pickSheet(): Promise<Sheet | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'text/comma-separated-values',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });
  if (res.canceled) return null;
  const f = res.assets[0];
  const buf = await (await fetch(f.uri)).arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const rows = raw.slice(0, MAX_ROWS).map((r) => r.map((c) => String(c ?? '')));
  if (!rows.length) throw new Error('empty');
  return { name: f.name, rows };
}
