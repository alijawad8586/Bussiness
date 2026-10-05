import { httpsCallable } from 'firebase/functions';
import { fns } from './firebase';
import { ImportResult, TemplateRef } from './types';

/** Turns any backend error into one sentence a clinic assistant can understand. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  if (code === 'functions/not-found' || code === 'functions/unavailable' || /NOT_FOUND|Failed to fetch|network/i.test(err?.message ?? '')) {
    return 'Cannot reach the backend. If this is the first run, deploy it once with: firebase deploy';
  }
  if (code === 'functions/unauthenticated') return 'Your session expired. Please log in again.';
  if (code === 'functions/internal') return err?.message && err.message !== 'internal' ? err.message : 'Something went wrong on our side. Please try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

async function call<I, O>(name: string, data?: I): Promise<O> {
  try {
    return (await httpsCallable<I, O>(fns, name, { timeout: 120_000 })(data as I)).data;
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export const api = {
  health: () => call<void, { ok: boolean }>('health'),
  connectWhatsApp: (d: { productId: string; wabaId: string; phoneNumberId: string; token: string }) =>
    call<typeof d, { displayNumber: string; verifiedName: string }>('connectWhatsAppFn', d),
  listTemplates: () => call<void, { templates: TemplateRef[] }>('listTemplatesFn'),
  saveAgent: (d: { provider: string; apiKey?: string; model?: string; baseUrl?: string; enabled: boolean }) => call<typeof d, { ok: boolean }>('saveAgentFn', d),
  testAgent: () => call<void, { ok: boolean; reply: string }>('testAgentFn'),
  importSheet: (d: { fileName: string; rows: string[][] }) => call<typeof d, ImportResult>('importSheetFn', d),
  startCampaign: (d: { sheetId: string }) => call<typeof d, { campaignId: string; total: number }>('startCampaignFn', d),
  campaignAction: (d: { campaignId: string; action: 'pause' | 'resume' | 'retryFailed' }) => call<typeof d, { count: number }>('campaignActionFn', d),
  sendManual: (d: { contactId: string; text: string }) => call<typeof d, { status: string }>('sendManualFn', d),
  sendTemplate: (d: { contactId: string }) => call<typeof d, { status: string }>('sendTemplateFn', d),
};
