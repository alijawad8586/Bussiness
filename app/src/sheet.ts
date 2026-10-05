import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';

export type PickedSheet = { name: string; rows: string[][]; columns: string[] };

const MAX_ROWS = 5000;
const clean = (v: unknown) => String(v ?? '').trim().slice(0, 500);

/** Same rules as the backend, so the names chosen here match the names it saves. */
export function headerNames(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = clean(h).replace(/[.\/~*\[\]`]/g, ' ').replace(/\s+/g, ' ').trim() || `column ${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name} (${n})`;
    return name;
  });
}

/** Opens the file picker and reads a CSV or Excel file. Returns null if the user cancels. */
export async function pickSheet(): Promise<PickedSheet | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  });
  if (res.canceled) return null;
  const f = res.assets[0];
  const buf = await (await fetch(f.uri)).arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  const first = wb.Sheets[wb.SheetNames[0]];
  // raw: false keeps phone numbers as text exactly as they look in the file
  const raw: unknown[][] = XLSX.utils.sheet_to_json(first, { header: 1, defval: '', raw: false });
  const rows = raw.slice(0, MAX_ROWS + 1).map((r) => r.map(clean));
  if (rows.length < 2) throw new Error('The file needs a header row and at least one patient.');
  return { name: f.name, rows, columns: headerNames(rows[0]) };
}
