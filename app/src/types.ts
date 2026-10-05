export type MsgStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'not_on_whatsapp';
export type CampaignStatus = 'queued' | 'running' | 'paused' | 'completed';

export interface TemplateRef {
  name: string;
  language: string;
  body: string;
  variableCount: number;
}

export interface MainSettings {
  mapping: { phoneCol: string; patientCol: string; doctorCol: string };
  template: TemplateRef | null;
  varCols: string[];
  autoSend: boolean;
  speed: number;
  agentEnabled: boolean;
}

export interface ServerSettings {
  whatsapp?: { connected: boolean; productId: string; wabaId: string; phoneNumberId: string; displayNumber: string; verifiedName: string; error?: string | null; webhookSubscribed?: boolean; subscribeError?: string | null };
  /** when WhatsApp last called our webhook (a Firestore timestamp) */
  webhook?: { lastAt?: { toMillis(): number }; inbound?: number; statuses?: number };
  agent?: { provider: string; model: string; baseUrl?: string; hasKey: boolean; lastError?: string | null };
}

export interface Contact {
  id: string;
  phone: string;
  name: string;
  doctor: string;
  fields: Record<string, string>;
  rowNumber: number | null;
  optOut: boolean;
  needsHuman: boolean;
  unread: number;
  lastMessageText: string;
  lastMessageAt: number | null;
  lastInboundAt: number | null;
  lastStatus: MsgStatus | null;
  whatsapp: 'ok' | 'invalid' | 'unknown';
}

export interface Message {
  id: string;
  contactId: string;
  phone: string;
  patient: string;
  doctor: string;
  direction: 'in' | 'out';
  kind: 'template' | 'text';
  by: 'campaign' | 'agent' | 'manual' | 'patient';
  template: string | null;
  text: string;
  status: MsgStatus;
  error: { code: number; message: string; hint: string } | null;
  createdAt: number;
  outAt: number | null;
  /** what the AI agent did with this patient message */
  agentOutcome?: string;
  agentError?: string;
}

export interface Campaign {
  id: string;
  template: { name: string; language: string; body: string };
  sheetName: string;
  status: CampaignStatus;
  total: number;
  optOutSkipped: number;
  speed: number;
  stats: { queued: number; sent: number; delivered: number; failed: number; notWhatsapp: number };
  byDoctor: Record<string, { total: number; delivered: number; failed: number; notWhatsapp: number }>;
  failReasons: Record<string, { count: number; label: string }>;
  timeline: Record<string, { delivered?: number; failed?: number; notWhatsapp?: number }>;
  error: string | null;
  createdAt: number;
}

export interface SheetInfo {
  id: string;
  fileName: string;
  columns: string[];
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
  status: 'importing' | 'done' | 'failed';
  createdAt: number;
}

export interface ImportResult {
  sheetId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
  campaign: { campaignId: string; total: number } | null;
  sendError: string | null;
}

export const DEFAULT_MAIN: MainSettings = {
  mapping: { phoneCol: '', patientCol: '', doctorCol: '' },
  template: null,
  varCols: [],
  autoSend: true,
  speed: 20,
  agentEnabled: false,
};

/** Firestore Timestamp (or null) to milliseconds */
export const ms = (v: any): number | null => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);
