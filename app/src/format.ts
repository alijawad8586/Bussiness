import { colors } from './theme';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(t: number) {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "09:14" today, "Yesterday", or a short date */
export function shortTime(t: number | null) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return formatTime(t);
  if (diff === 1) return 'Yesterday';
  return formatDate(t);
}

export function pct(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '0.0%';
}

export function initials(name: string) {
  const s = name.replace(/^Dr\.?\s*/i, '').trim();
  if (!s) return '#';
  return s.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = ['#0e7490', '#7c3aed', '#b91c1c', '#b45309', '#15803d', '#1d4ed8', '#be185d'];
export const avatarColor = (key: string) => AVATAR_COLORS[[...key].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length] ?? colors.primary;

/** "appointment_reminder" -> "Appointment reminder" */
export function nicename(templateName: string) {
  const s = templateName.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const phoneLabel = (digits: string) => `+${digits}`;
