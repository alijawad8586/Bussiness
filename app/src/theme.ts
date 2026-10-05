export const colors = {
  primary: '#128c7e',
  dark: '#075e54',
  green: '#25d366',
  bg: '#f4f6f8',
  card: '#ffffff',
  border: '#e3e8ec',
  text: '#111b21',
  muted: '#667781',
  placeholder: '#8696a0',
  tint: '#e7f6f3',
  tintSoft: '#eaf6f3',
  bubbleOut: '#d9fdd3',
  chatBg: '#eef1f4',
  tableHead: '#f8fafb',
  track: '#e5eaee',
  blue: '#1d4ed8',
  blueBg: '#dbeafe',
  danger: '#b91c1c',
};

export type Status = 'Delivered' | 'Failed' | 'Not on WhatsApp' | 'Sent' | 'Queued';

export const statusColors: Record<Status, { bg: string; fg: string; dot: string }> = {
  Delivered: { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e' },
  Failed: { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444' },
  'Not on WhatsApp': { bg: '#fef3c7', fg: '#b45309', dot: '#f59e0b' },
  Sent: { bg: '#dbeafe', fg: '#1d4ed8', dot: '#3b82f6' },
  Queued: { bg: '#eef1f4', fg: '#667781', dot: '#9aa7b0' },
};

export const font = { regular: '400' as const, medium: '500' as const, semi: '600' as const, bold: '700' as const };
