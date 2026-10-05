import { Platform, Share } from 'react-native';
import { Message } from './types';
import { formatDate, formatTime, phoneLabel } from './format';

const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function messagesToCsv(rows: Message[]) {
  const head = 'Phone number,Patient,Doctor,Message,Status,Error,Time';
  const lines = rows.map((m) => {
    const t = m.outAt ?? m.createdAt;
    return [phoneLabel(m.phone), m.patient, m.doctor, m.text, m.status, m.error?.hint ?? '', `${formatDate(t)} ${formatTime(t)}`].map(esc).join(',');
  });
  return [head, ...lines].join('\n');
}

/** Web: download a file. Phones: open the share sheet with the text. */
export async function saveText(name: string, text: string, mime = 'text/csv') {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ message: text, title: name });
  }
}
