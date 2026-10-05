import { Timestamp } from 'firebase-admin/firestore';
import { normalizePhone } from './phone.js';
import { col, loadMain, type Deps } from './repo.js';
import { AppError, type ContactDoc } from './types.js';

const MAX_ROWS = 5000;
const CHUNK = 400;

export interface ImportSummary {
  sheetId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
}

const clean = (v: unknown) => String(v ?? '').trim().slice(0, 500);

/** Unique, non-empty column names (a sheet can have blank or repeated headers). */
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
 * Turns an uploaded sheet into contacts, one row at a time.
 * - A bad row (empty or invalid phone) is skipped and reported; it never stops the import.
 * - The contact id is the phone number, so uploading the same file again updates instead of duplicating.
 */
export async function importSheet(uid: string, input: { fileName: string; rows: unknown[][] }, deps: Deps): Promise<ImportSummary> {
  const rows = input.rows;
  if (!Array.isArray(rows) || rows.length < 2) throw new AppError('invalid-argument', 'The file needs a header row and at least one patient row.');
  if (rows.length - 1 > MAX_ROWS) throw new AppError('invalid-argument', `Too many rows. The limit is ${MAX_ROWS} patients per file.`);

  const main = await loadMain(uid);
  const columns = headerNames(rows[0]);
  const idx = (name: string) => columns.indexOf(name);
  const phoneIdx = idx(main.mapping.phoneCol);
  if (!main.mapping.phoneCol || phoneIdx < 0) throw new AppError('failed-precondition', 'Choose the phone number column first, then save settings.');
  const patientIdx = idx(main.mapping.patientCol);
  const doctorIdx = idx(main.mapping.doctorCol);

  const now = Timestamp.fromDate(deps.now());
  const sheetRef = col(uid, 'sheets').doc();
  await sheetRef.set({ fileName: clean(input.fileName) || 'sheet', columns, status: 'importing', rows: rows.length - 1, createdAt: now });

  const errors: { row: number; reason: string }[] = [];
  const unique = new Map<string, { row: number; cells: unknown[] }>();
  let duplicates = 0;
  for (let i = 1; i < rows.length; i++) {
    const cells = Array.isArray(rows[i]) ? rows[i] : [];
    if (cells.every((c) => !clean(c))) continue; // blank line
    const p = normalizePhone(cells[phoneIdx]);
    if (!p.ok) {
      errors.push({ row: i + 1, reason: p.reason });
      continue;
    }
    if (unique.has(p.digits)) {
      duplicates++;
      continue;
    }
    unique.set(p.digits, { row: i + 1, cells });
  }

  let created = 0;
  let updated = 0;
  const entries = [...unique.entries()];
  try {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const refs = chunk.map(([phone]) => col(uid, 'contacts').doc(phone));
      const existing = await col(uid, 'contacts').firestore.getAll(...refs);
      const batch = col(uid, 'contacts').firestore.batch();
      chunk.forEach(([phone, { row, cells }], k) => {
        const fields: Record<string, string> = {};
        columns.forEach((c, ci) => (fields[c] = clean(cells[ci])));
        const common = {
          name: patientIdx >= 0 ? clean(cells[patientIdx]) : '',
          doctor: doctorIdx >= 0 ? clean(cells[doctorIdx]) : '',
          fields,
          sheetId: sheetRef.id,
          rowNumber: row,
          updatedAt: now,
        };
        if (existing[k].exists) {
          batch.update(refs[k], common); // keeps unread, chat info, opt-out and so on
          updated++;
        } else {
          const doc: ContactDoc = {
            phone, ...common, whatsapp: 'unknown', optOut: false, needsHuman: false, unread: 0,
            lastMessageText: '', lastMessageAt: null, lastInboundAt: null, lastStatus: null,
            agentWindowStart: null, agentCount: 0, createdAt: now,
          };
          batch.set(refs[k], doc);
          created++;
        }
      });
      await batch.commit();
    }
  } catch (e) {
    await sheetRef.update({ status: 'failed', error: e instanceof Error ? e.message : 'Import failed', created, updated });
    throw new AppError('internal', 'Import stopped because of a database problem. Nothing was sent. Please try again.');
  }

  await sheetRef.update({
    status: 'done', created, updated, skipped: errors.length, duplicates, errors: errors.slice(0, 50), finishedAt: Timestamp.fromDate(deps.now()),
  });
  return { sheetId: sheetRef.id, total: rows.length - 1, created, updated, skipped: errors.length, duplicates, errors: errors.slice(0, 50) };
}
