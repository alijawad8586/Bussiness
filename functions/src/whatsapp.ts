import type { TemplateRef } from './types.js';
import type { WaError } from './waErrors.js';

const base = () => process.env.WA_API_BASE || 'https://graph.facebook.com/v21.0';

export type SendResult = { ok: true; waMessageId: string } | { ok: false; error: WaError };

/** The only door to WhatsApp. Tests replace it with a fake. */
export interface WaApi {
  sendTemplate(a: { phoneNumberId: string; token: string; to: string; template: { name: string; language: string }; params: string[] }): Promise<SendResult>;
  sendText(a: { phoneNumberId: string; token: string; to: string; text: string }): Promise<SendResult>;
  listTemplates(a: { wabaId: string; token: string }): Promise<{ ok: true; templates: TemplateRef[] } | { ok: false; error: WaError }>;
  verifyNumber(a: { phoneNumberId: string; token: string }): Promise<{ ok: true; displayNumber: string; verifiedName: string } | { ok: false; error: WaError }>;
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<{ ok: true; json: any } | { ok: false; error: WaError }> {
  try {
    const res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = json?.error ?? {};
      return { ok: false, error: { code: Number(e.code ?? 0), message: String(e.error_data?.details ?? e.message ?? res.statusText), httpStatus: res.status } };
    }
    return { ok: true, json };
  } catch (err) {
    // timeouts and DNS/connection problems: treated as temporary
    return { ok: false, error: { code: 0, message: err instanceof Error ? err.message : 'Network error', httpStatus: 0 } };
  }
}

/** WhatsApp rejects template values with new lines, tabs or empty text. */
export function cleanParam(v: string) {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return s.slice(0, 1000) || '-';
}

export const realWa: WaApi = {
  async sendTemplate({ phoneNumberId, token, to, template, params }) {
    const r = await call(`/${encodeURIComponent(phoneNumberId)}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: cleanParam(text) })) }] } : {}),
        },
      }),
    });
    if (!r.ok) return r;
    const id = r.json?.messages?.[0]?.id;
    return id ? { ok: true, waMessageId: String(id) } : { ok: false, error: { code: 0, message: 'WhatsApp did not return a message id', httpStatus: 502 } };
  },

  async sendText({ phoneNumberId, token, to, text }) {
    const r = await call(`/${encodeURIComponent(phoneNumberId)}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000), preview_url: false } }),
    });
    if (!r.ok) return r;
    const id = r.json?.messages?.[0]?.id;
    return id ? { ok: true, waMessageId: String(id) } : { ok: false, error: { code: 0, message: 'WhatsApp did not return a message id', httpStatus: 502 } };
  },

  async listTemplates({ wabaId, token }) {
    const r = await call(`/${encodeURIComponent(wabaId)}/message_templates?status=APPROVED&limit=100&fields=name,language,status,components`, token);
    if (!r.ok) return r;
    const templates: TemplateRef[] = [];
    for (const t of (r.json?.data ?? []) as any[]) {
      const body: string | undefined = t.components?.find((c: any) => c.type === 'BODY')?.text;
      if (!body || /\{\{\s*[a-z_]+\s*\}\}/i.test(body)) continue; // only numbered variables ({{1}}) are supported
      const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      templates.push({ name: t.name, language: t.language, body, variableCount: nums.length ? Math.max(...nums) : 0 });
    }
    return { ok: true, templates };
  },

  async verifyNumber({ phoneNumberId, token }) {
    const r = await call(`/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, token);
    if (!r.ok) return r;
    return { ok: true, displayNumber: String(r.json?.display_phone_number ?? ''), verifiedName: String(r.json?.verified_name ?? '') };
  },
};
