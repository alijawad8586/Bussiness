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

/**
 * Real sheets often start with a title ("Clinic Leads Dashboard") or blank lines before the column names.
 * The header is the first row that is about as full as the fullest of the first rows.
 */
export function findHeaderRow(rows: string[][]): number {
  const count = (r: string[]) => r.filter((c) => c !== '').length;
  const head = rows.slice(0, 15);
  const most = Math.max(0, ...head.map(count));
  if (most < 2) return 0;
  const i = head.findIndex((r) => count(r) >= Math.ceil(most * 0.6) && count(r) >= 2);
  return i < 0 ? 0 : i;
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
  const all = raw.map((r) => r.map(clean));
  const rows = all.slice(findHeaderRow(all), undefined).slice(0, MAX_ROWS + 1);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one patient.');
  return { name: f.name, rows, columns: headerNames(rows[0]) };
}
