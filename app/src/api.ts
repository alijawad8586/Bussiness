import { API_BASE, auth } from './firebase';
import { ImportResult, TemplateRef } from './types';

/** Turns any backend error into one sentence a clinic assistant can understand. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  return err?.message || 'Something went wrong. Please try again.';
}

const NOT_CONFIGURED = 'BACKEND_NOT_CONFIGURED';

async function call<I, O>(fn: string, data?: I): Promise<O> {
  let res: Response;
  try {
    const token = await auth.currentUser?.getIdToken();
    res = await fetch(`${API_BASE}/api/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ fn, data: data ?? {} }),
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet and try again.');
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* not json */ }
  if (res.ok) return body?.result as O;
  const msg: string = body?.error?.message ?? '';
  if (msg === NOT_CONFIGURED) {
    throw new Error('The server is not connected to your database yet. Add FIREBASE_SERVICE_ACCOUNT in Vercel → Settings → Environment Variables, then redeploy (see README).');
  }
  if (res.status === 401) throw new Error('Your session expired. Please log in again.');
  if (res.status === 404 && !msg) throw new Error('The server API was not found. Please redeploy the app.');
  const detail: string = body?.error?.detail ?? '';
  throw new Error((msg || 'Something went wrong on our side. Please try again.') + (detail ? ` (${detail})` : ''));
}

export const api = {
  kick: (d: { campaignId: string }) => call<typeof d, { ok: boolean; status: string }>('kick', d),
  health: () => call<void, { ok: boolean }>('health'),
  connectWhatsApp: (d: { productId: string; wabaId: string; phoneNumberId: string; token: string }) =>
    call<typeof d, { displayNumber: string; verifiedName: string }>('connectWhatsApp', d),
  listTemplates: () => call<void, { templates: TemplateRef[] }>('listTemplates'),
  saveAgent: (d: { provider: string; apiKey?: string; model?: string; baseUrl?: string; enabled: boolean }) => call<typeof d, { ok: boolean }>('saveAgent', d),
  testAgent: () => call<void, { ok: boolean; reply: string }>('testAgent'),
  importSheet: (d: { fileName: string; rows: string[][] }) => call<typeof d, ImportResult>('importSheet', d),
  startCampaign: (d: { sheetId: string }) => call<typeof d, { campaignId: string; total: number }>('startCampaign', d),
  campaignAction: (d: { campaignId: string; action: 'pause' | 'resume' | 'retryFailed' }) => call<typeof d, { count: number }>('campaignAction', d),
  sendManual: (d: { contactId: string; text: string }) => call<typeof d, { status: string }>('sendManual', d),
  sendTemplate: (d: { contactId: string }) => call<typeof d, { status: string }>('sendTemplate', d),
};
