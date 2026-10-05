import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Firestore layout (everything belongs to one signed-in user):
 *
 * users/{uid}                         profile
 * users/{uid}/settings/main           client-editable: mapping, template, variables, speed, autoSend, agentEnabled
 * users/{uid}/settings/server         server-written: whatsapp {connected, displayNumber...}, agent {provider, model, hasKey}
 * users/{uid}/private/secrets         WhatsApp token + AI key. Nobody but the server can read it (rules: deny all)
 * users/{uid}/sheets/{sheetId}        one uploaded file + import result
 * users/{uid}/contacts/{phoneDigits}  one patient. The id is the normalised phone number, so a number is never stored twice
 * users/{uid}/campaigns/{id}          one sending run + live counters
 * users/{uid}/messages/{id}           every message in or out (the chat history and the delivery report)
 * phoneNumbers/{phoneNumberId}        { uid }  lets the webhook find the owner of a WhatsApp number
 */

/** queued -> sent -> delivered -> read, or failed / not_on_whatsapp. */
export type MsgStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'not_on_whatsapp';

/** Counter buckets on a campaign. `read` counts as delivered. */
export type Bucket = 'queued' | 'sent' | 'delivered' | 'failed' | 'notWhatsapp';

export type CampaignStatus = 'queued' | 'running' | 'paused' | 'completed';

export interface TemplateRef {
  name: string;
  language: string;
  body: string;
  /** how many {{1}} {{2}} ... variables the body has */
  variableCount: number;
}

export interface MainSettings {
  mapping: { phoneCol: string; patientCol: string; doctorCol: string };
  template: TemplateRef | null;
  /** varCols[0] is the sheet column that fills {{1}}, and so on */
  varCols: string[];
  autoSend: boolean;
  /** messages per minute */
  speed: number;
  agentEnabled: boolean;
}

export interface ServerSettings {
  whatsapp?: {
    connected: boolean;
    productId: string;
    wabaId: string;
    phoneNumberId: string;
    displayNumber: string;
    verifiedName: string;
    error?: string | null;
  };
  agent?: { provider: string; model: string; baseUrl?: string; hasKey: boolean; lastError?: string | null };
}

export interface Secrets {
  whatsappToken?: string;
  aiKey?: string;
}

export interface ContactDoc {
  phone: string;
  name: string;
  doctor: string;
  fields: Record<string, string>;
  sheetId: string | null;
  rowNumber: number | null;
  whatsapp: 'unknown' | 'ok' | 'invalid';
  optOut: boolean;
  needsHuman: boolean;
  unread: number;
  lastMessageText: string;
  lastMessageAt: Timestamp | null;
  lastInboundAt: Timestamp | null;
  lastStatus: MsgStatus | null;
  agentWindowStart: Timestamp | null;
  agentCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MessageDoc {
  contactId: string;
  phone: string;
  patient: string;
  patientLower: string;
  doctor: string;
  direction: 'in' | 'out';
  kind: 'template' | 'text';
  by: 'campaign' | 'agent' | 'manual' | 'patient';
  campaignId: string | null;
  template: string | null;
  templateLanguage: string | null;
  /** values for {{1}}, {{2}} ... of the template */
  params: string[];
  text: string;
  status: MsgStatus;
  waMessageId: string | null;
  error: { code: number; message: string; hint: string } | null;
  attempts: number;
  /** a worker holds this message until then, so two workers never send it twice */
  lockedUntil: Timestamp | null;
  /** set only on outbound messages, so `orderBy(outAt)` lists exactly the outbound ones */
  outAt: Timestamp | null;
  bucket: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export class AppError extends Error {
  constructor(
    public code: 'invalid-argument' | 'failed-precondition' | 'not-found' | 'permission-denied' | 'unauthenticated' | 'resource-exhausted' | 'unavailable' | 'internal',
    message: string,
  ) {
    super(message);
  }
}
