import { Status } from './theme';

/** The design is set on 4 Oct 2026, so the demo treats that as "today". */
export const TODAY = '2026-10-04';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function pct(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '0.0%';
}

export function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['#0e7490', '#7c3aed', '#b91c1c', '#b45309', '#15803d', '#1d4ed8', '#be185d'];
export const avatarColor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/* ---------- Doctors & templates ---------- */

export const DOCTORS = ['Dr. Imran Qureshi', 'Dr. Sara Ahmed', 'Dr. Bilal Hussain'];

export interface Template {
  name: string;
  label: string;
  meta: string;
  body: string;
}

export const TEMPLATES: Template[] = [
  {
    name: 'appointment_reminder',
    label: 'Appointment reminders',
    meta: 'Utility · English · Approved',
    body: 'Assalam o Alaikum {{patient_name}}, this is a reminder for your appointment with {{doctor}} on {{appointment_time}}. Reply YES to confirm.',
  },
  {
    name: 'report_ready',
    label: 'Lab report ready',
    meta: 'Utility · English · Approved',
    body: 'Assalam o Alaikum {{patient_name}}, your lab report from {{doctor}} is ready for collection. Please visit the clinic.',
  },
  {
    name: 'follow_up_visit',
    label: 'Follow-up visit',
    meta: 'Utility · English · Approved',
    body: 'Assalam o Alaikum {{patient_name}}, {{doctor}} would like to see you for a follow-up visit on {{appointment_time}}. Reply YES to confirm.',
  },
];

export function fillTemplate(body: string, v: { patient_name: string; doctor: string; appointment_time: string }) {
  return body
    .replace(/\{\{patient_name\}\}/g, v.patient_name)
    .replace(/\{\{doctor\}\}/g, v.doctor)
    .replace(/\{\{appointment_time\}\}/g, v.appointment_time);
}

export const APPOINTMENT = '6 Oct at 4:30 PM';

/* ---------- Messages (one row per patient message) ---------- */

export interface Msg {
  id: number;
  phone: string;
  patient: string;
  doctor: string;
  text: string;
  status: Status;
  time: string;
}

const FIRST = ['Ayesha', 'Muhammad', 'Fatima', 'Ali', 'Sana', 'Hamza', 'Zainab', 'Bilal', 'Hira', 'Usman', 'Maryam', 'Ahmed', 'Noor', 'Hassan', 'Amna', 'Omar'];
const LAST = ['Khan', 'Usman', 'Noor', 'Raza', 'Malik', 'Sheikh', 'Iqbal', 'Ahmad', 'Aslam', 'Tariq', 'Butt', 'Siddiqui', 'Javed', 'Mirza'];
// Real people from the design, in order, for the first rows.
const DESIGN_ROWS: [string, string][] = [
  ['Ayesha Khan', '+92 300 1234567'],
  ['Muhammad Usman', '+92 321 7788990'],
  ['Fatima Noor', '+92 333 4561230'],
  ['Ali Raza', '+92 345 9087654'],
  ['Sana Malik', '+92 302 5566771'],
  ['Hamza Sheikh', '+92 311 2345098'],
  ['Zainab Iqbal', '+92 322 6612345'],
  ['Bilal Ahmad', '+92 300 8899001'],
  ['Hira Aslam', '+92 315 7421987'],
  ['Usman Tariq', '+92 346 1029384'],
];

export const TOTAL = 1186;
const FAILED = 96;
const NOT_WA = 48;
const DOCTOR_WEIGHTS = [470, 396, 320];
// Doctors for the first rows, as shown in the design.
const DESIGN_DOCTORS = [0, 1, 0, 2, 1, 2, 0, 1, 0, 2];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function buildMessages(): Msg[] {
  const out: Msg[] = [];
  const credit = [0, 0, 0];
  let failed = 0;
  let notWa = 0;
  for (let i = 0; i < TOTAL; i++) {
    // smooth weighted round robin => exactly 470 / 396 / 320
    DOCTOR_WEIGHTS.forEach((w, d) => (credit[d] += w));
    const d = credit.indexOf(Math.max(...credit));
    credit[d] -= TOTAL;
    const doctor = DOCTORS[i < DESIGN_DOCTORS.length ? DESIGN_DOCTORS[i] : d];

    let status: Status = 'Delivered';
    if (i % 12 === 2 && failed < FAILED) {
      status = 'Failed';
      failed++;
    } else if (i % 24 === 3 && notWa < NOT_WA) {
      status = 'Not on WhatsApp';
      notWa++;
    }

    const base = i < DESIGN_ROWS.length ? DESIGN_ROWS[i] : null;
    const patient = base ? base[0] : `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`;
    const phone = base ? base[1] : `+92 3${pad(i % 50)} ${String(1000000 + ((i * 7919) % 8999999))}`;

    const minutes = 2 + Math.floor((i * 70) / TOTAL);
    const time = `${pad(9 + Math.floor(minutes / 60))}:${pad(minutes % 60)} AM`;
    out.push({
      id: i + 1,
      phone,
      patient,
      doctor,
      text: `Reminder: your appointment with ${doctor} is on ${APPOINTMENT}. Reply YES to confirm.`,
      status,
      time,
    });
  }
  return out;
}

export const MESSAGES: Msg[] = buildMessages();

export function summarize(list: { status: Status }[]) {
  const sent = list.length;
  const delivered = list.filter((m) => m.status === 'Delivered').length;
  const failed = list.filter((m) => m.status === 'Failed').length;
  return { sent, delivered, failed, notWa: sent - delivered - failed };
}

export const LAST_7_DAYS: [string, number][] = [
  ['Mon', 120], ['Tue', 180], ['Wed', 95], ['Thu', 210], ['Fri', 260], ['Sat', 160], ['Sun', 161],
];

/* ---------- Reports ---------- */

export interface Report {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  template: string;
  sent: number;
  delivered: number;
  failed: number;
  notWa: number;
  source: string;
}

function seedReport(id: string, template: string, date: string, sent: number, rate: number): Report {
  const delivered = Math.round((sent * rate) / 100);
  const failed = Math.round((sent - delivered) * 0.67);
  return {
    id,
    name: TEMPLATES.find((t) => t.name === template)!.label,
    date,
    template,
    sent,
    delivered,
    failed,
    notWa: sent - delivered - failed,
    source: 'Patients sheet',
  };
}

const latest = summarize(MESSAGES);

export const SEED_REPORTS: Report[] = [
  { ...seedReport('r1', 'appointment_reminder', '2026-10-04', latest.sent, 0), ...latest },
  seedReport('r2', 'appointment_reminder', '2026-09-27', 1102, 91.2),
  seedReport('r3', 'report_ready', '2026-09-24', 640, 94.5),
  seedReport('r4', 'follow_up_visit', '2026-09-18', 412, 89.3),
  seedReport('r5', 'appointment_reminder', '2026-09-13', 1054, 90.4),
  seedReport('r6', 'report_ready', '2026-09-08', 598, 93.1),
];

export const deliveryRate = (r: Report) => (r.sent ? (r.delivered / r.sent) * 100 : 0);

/** Splits `total` by `weights`, keeping the sum exact (largest remainder). */
export function split(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left-- > 0) out[i]++;
    });
  return out;
}

export function buildDetail(r: Report) {
  const doctors = split(r.sent, DOCTOR_WEIGHTS).map((sent, i) => {
    const delivered = Math.round((sent * r.delivered) / (r.sent || 1));
    const failed = Math.round((sent * r.failed) / (r.sent || 1));
    return { name: DOCTORS[i], sent, delivered, failed, notWa: Math.max(0, sent - delivered - failed) };
  });
  const batches = split(r.sent, [210, 215, 220, 205, 200, 136]).map((n, i) => {
    const [d, f, w] = split(n, [r.delivered, r.failed, r.notWa].map((x) => x || 0.0001));
    return { label: `09:${i}0`, total: n, delivered: d, failed: f, notWa: w };
  });
  const reasons = split(r.failed, [41, 28, 15, 12]);
  return {
    doctors,
    batches,
    reasons: ['Recipient unreachable', 'Message undeliverable', 'Rate limit reached', 'Other'].map((label, i) => ({
      label,
      count: reasons[i],
    })),
  };
}

/* ---------- Inbox ---------- */

export interface Chat {
  id: string;
  dir: 'in' | 'out';
  text: string;
  time: string;
  template?: string;
  read?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  phone: string;
  doctor: string;
  unread: number;
  status: Status;
  template: string;
  sentAt: string;
  row: number;
  time: string;
  chats: Chat[];
}

function reminder(name: string, doctor: string) {
  return fillTemplate(TEMPLATES[0].body, { patient_name: name.split(' ')[0], doctor, appointment_time: APPOINTMENT });
}

function conv(
  i: number, name: string, phone: string, doctor: string, status: Status, unread: number,
  time: string, reply?: string, template = 'appointment_reminder',
): Conversation {
  const body = reminder(name, doctor);
  const chats: Chat[] = [{ id: `c${i}-1`, dir: 'out', text: body, time: '09:02', template, read: status === 'Delivered' }];
  if (reply) chats.push({ id: `c${i}-2`, dir: 'in', text: reply, time });
  return { id: `v${i}`, name, phone, doctor, unread, status, template, sentAt: '4 Oct 2026, 09:02', row: i + 11, time, chats };
}

export const SEED_CONVERSATIONS: Conversation[] = (() => {
  const list: Conversation[] = [
    conv(1, 'Ayesha Khan', '+92 300 1234567', DOCTORS[0], 'Delivered', 1, '09:14', 'YES, I will be there. Thank you'),
    conv(2, 'Muhammad Usman', '+92 321 7788990', DOCTORS[1], 'Delivered', 0, '09:02'),
    conv(3, 'Fatima Noor', '+92 333 4561230', DOCTORS[0], 'Failed', 0, '09:03'),
    conv(4, 'Hamza Sheikh', '+92 311 2345098', DOCTORS[2], 'Delivered', 2, '08:47', 'Can I reschedule to Thursday?'),
    conv(5, 'Sana Malik', '+92 302 5566771', DOCTORS[1], 'Delivered', 0, '08:30', 'Thank you doctor!'),
    conv(6, 'Zainab Iqbal', '+92 322 6612345', DOCTORS[0], 'Delivered', 0, 'Yesterday', undefined, 'report_ready'),
    conv(7, 'Hira Aslam', '+92 315 7421987', DOCTORS[0], 'Delivered', 0, 'Yesterday'),
  ];
  const extra: [string, string, Status, number, string?][] = [
    ['Bilal Ahmad', '+92 300 8899001', 'Delivered', 1, 'What time is my appointment?'],
    ['Usman Tariq', '+92 346 1029384', 'Delivered', 1, 'YES'],
    ['Maryam Butt', '+92 301 4455667', 'Failed', 0],
    ['Omar Javed', '+92 312 9988776', 'Delivered', 3, 'Please send the clinic address'],
    ['Amna Siddiqui', '+92 333 1122334', 'Delivered', 1, 'Confirmed, thanks'],
    ['Hassan Mirza', '+92 345 6677889', 'Failed', 0],
    ['Noor Fatima', '+92 321 5544332', 'Delivered', 2, 'Can the doctor call me?'],
    ['Ahmed Raza', '+92 300 2233445', 'Delivered', 1, 'YES, see you then'],
    ['Sidra Malik', '+92 316 7788112', 'Delivered', 1, 'Running 10 minutes late'],
    ['Faisal Khan', '+92 302 9900112', 'Delivered', 1, 'Thank you'],
    ['Rabia Iqbal', '+92 311 3344556', 'Delivered', 0],
    ['Kamran Sheikh', '+92 345 1212343', 'Delivered', 0, 'Okay'],
    ['Sadia Noor', '+92 322 8877665', 'Delivered', 1, 'Is parking available?'],
    ['Talha Aslam', '+92 333 6655443', 'Delivered', 0],
    ['Mehwish Ali', '+92 300 4433221', 'Delivered', 1, 'YES'],
    ['Danish Butt', '+92 321 1100998', 'Delivered', 0],
    ['Iqra Hussain', '+92 315 5566778', 'Delivered', 0, 'Thanks!'],
  ];
  extra.forEach(([n, p, s, u, r], k) => {
    const i = 8 + k;
    list.push(conv(i, n, p, DOCTORS[k % 3], s, u, `08:${pad(50 - k * 2)}`, r));
  });
  return list;
})();
