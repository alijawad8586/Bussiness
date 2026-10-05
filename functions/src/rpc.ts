import { campaignAction, createCampaign, sendManual, sendTemplateToContact } from './messaging.js';
import { col, loadMain, type Deps } from './repo.js';
import { importSheet } from './sheetImport.js';
import { connectWhatsApp, listTemplates, saveAgent, startChat, subscribeWebhook, testAgent } from './setup.js';
import { AppError } from './types.js';

/** Upload: create contacts from the sheet, then (if Auto-send is on) start sending. */
export async function importAndSend(uid: string, data: { fileName: string; rows: unknown[][] }, deps: Deps) {
  const summary = await importSheet(uid, data, deps);
  let campaign: { campaignId: string; total: number } | null = null;
  let sendError: string | null = null;
  if ((await loadMain(uid)).autoSend && summary.created + summary.updated > 0) {
    try {
      campaign = await createCampaign(uid, { sheetId: summary.sheetId }, deps);
    } catch (e) {
      // Contacts are saved. Tell the user why sending did not start.
      sendError = e instanceof AppError ? e.message : 'Sending could not start.';
    }
  }
  return { ...summary, campaign, sendError };
}

/** Every call the app can make, by name. Used by hosts that are not Firebase Functions (for example Vercel). */
export async function handleRpc(fn: string, uid: string, data: any, deps: Deps): Promise<unknown> {
  switch (fn) {
    case 'connectWhatsApp': return connectWhatsApp(uid, data, deps);
    case 'listTemplates': return listTemplates(uid, deps);
    case 'saveAgent': return saveAgent(uid, data);
    case 'testAgent': return testAgent(uid, deps);
    case 'importSheet': return importAndSend(uid, data, deps);
    case 'startCampaign':
      if (!data?.sheetId) throw new AppError('invalid-argument', 'Upload a sheet first.');
      return createCampaign(uid, { sheetId: String(data.sheetId) }, deps);
    case 'campaignAction': return campaignAction(uid, data, deps);
    case 'sendManual': return sendManual(uid, data, deps);
    case 'subscribeWebhook': return subscribeWebhook(uid, deps);
    case 'startChat': return startChat(uid, data, deps);
    case 'sendTemplate': return sendTemplateToContact(uid, data, deps);
    case 'kick': {
      // The app calls this while a report is open, so sending continues even if a worker stopped.
      const id = String(data?.campaignId ?? '');
      const c = id ? await col(uid, 'campaigns').doc(id).get() : null;
      if (!c?.exists) throw new AppError('not-found', 'Report not found.');
      const st = c.data()!.status;
      if ((st === 'queued' || st === 'running') && deps.kick) await deps.kick(uid, id);
      return { ok: true, status: st };
    }
    default:
      throw new AppError('not-found', `Unknown function: ${fn}`);
  }
}
