export interface AiProviderInfo {
  id: string;
  name: string;
  kind: 'openai' | 'gemini' | 'anthropic';
  url: string;
  model: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  { id: 'gemini', name: 'Gemini (Google)', kind: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { id: 'openai', name: 'ChatGPT (OpenAI)', kind: 'openai', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5-20251001' },
  { id: 'groq', name: 'Groq', kind: 'openai', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'custom', name: 'Other (OpenAI-compatible)', kind: 'openai', url: '', model: '' },
];

export interface AiConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  key: string;
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

/** `transient` = worth retrying (rate limit, outage); otherwise the key/model/request is wrong. */
export class AiError extends Error {
  constructor(message: string, public transient: boolean) {
    super(message);
  }
}

/** Stops the server from being used to call internal addresses through a "custom provider" URL. */
export function assertSafeBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AiError('The API address is not a valid URL.', false);
  }
  const local = process.env.FUNCTIONS_EMULATOR === 'true' && ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (!local) {
    if (u.protocol !== 'https:') throw new AiError('The API address must start with https://', false);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h === '::1' || h.startsWith('[')) {
      throw new AiError('That API address is not allowed.', false);
    }
  }
  return raw.replace(/\/+$/, '');
}

function endpoint(cfg: AiConfig): { info: AiProviderInfo; url: string } {
  const info = AI_PROVIDERS.find((p) => p.id === cfg.provider);
  if (!info) throw new AiError('Unknown AI provider.', false);
  const url = cfg.provider === 'custom' ? assertSafeBaseUrl(cfg.baseUrl ?? '') : info.url;
  return { info, url };
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    throw new AiError(e instanceof Error ? e.message : 'Network error', true);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error?.message ?? json?.message ?? res.statusText);
    throw new AiError(`${res.status}: ${msg}`, res.status === 429 || res.status >= 500);
  }
  return json;
}

/** One call to the chosen AI. Returns the reply text. */
export async function generate(cfg: AiConfig, system: string, history: HistoryItem[]): Promise<string> {
  const { info, url } = endpoint(cfg);
  const model = cfg.model || info.model;
  let text = '';
  if (info.kind === 'gemini') {
    const j = await post(`${url}/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': cfg.key }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    });
    text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  } else if (info.kind === 'anthropic') {
    const j = await post(`${url}/messages`, { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, {
      model, max_tokens: 400, system, messages: history.map((m) => ({ role: m.role, content: m.text })),
    });
    text = (j.content ?? []).map((p: any) => p.text ?? '').join('');
  } else {
    const j = await post(`${url}/chat/completions`, { Authorization: `Bearer ${cfg.key}` }, {
      model, max_tokens: 400, messages: [{ role: 'system', content: system }, ...history.map((m) => ({ role: m.role, content: m.text }))],
    });
    text = j.choices?.[0]?.message?.content ?? '';
  }
  if (!text.trim()) throw new AiError('The AI returned an empty answer.', false);
  return text;
}

async function get(url: string, headers: Record<string, string>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new AiError(e instanceof Error ? e.message : 'Network error', true);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error?.message ?? json?.message ?? res.statusText);
    throw new AiError(`${res.status}: ${msg}`, res.status === 429 || res.status >= 500);
  }
  return json;
}

/**
 * Asks the provider which models this key may use. It doubles as the key check: a wrong key
 * is rejected here (401/403), and no model name is needed for it.
 */
export async function listModels(cfg: Pick<AiConfig, 'provider' | 'baseUrl' | 'key'>): Promise<string[]> {
  const { info, url } = endpoint({ ...cfg, model: '' });
  if (info.kind === 'gemini') {
    const j = await get(`${url}/models?pageSize=200`, { 'x-goog-api-key': cfg.key });
    return (j.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  if (info.kind === 'anthropic') {
    const j = await get(`${url}/models?limit=100`, { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' });
    return (j.data ?? []).map((m: any) => String(m.id ?? '')).filter(Boolean);
  }
  const j = await get(`${url}/models`, { Authorization: `Bearer ${cfg.key}` });
  return (j.data ?? []).map((m: any) => String(m.id ?? '')).filter(Boolean);
}

const NOT_CHAT = /embed|whisper|tts|speech|audio|transcri|moderation|guard|image|dall|vision-preview|rerank|imagen|veo|aqa|robotics|live|realtime|search|computer-use|instruct-\d|davinci|babbage|ada\b|omni-moderation/i;

/** Picks a good, cheap chat model from what the key can use. */
export function pickModel(providerId: string, available: string[]): string | null {
  const chat = available.filter((m) => !NOT_CHAT.test(m));
  const prefer: Record<string, RegExp[]> = {
    gemini: [/^gemini-2\.5-flash$/, /^gemini-2\.0-flash$/, /^gemini-.*flash(?!-lite)(?!.*(preview|exp|thinking))/, /^gemini-.*flash/, /^gemini-/],
    openai: [/^gpt-4o-mini$/, /^gpt-4\.1-mini$/, /^gpt-5.*mini$/, /^gpt-4o$/, /^gpt-/],
    anthropic: [/haiku/, /sonnet/, /^claude-/],
    groq: [/^llama-3\.3-70b-versatile$/, /^llama-3\.1-8b-instant$/, /llama/, /^(gemma|mixtral|qwen)/],
  };
  for (const re of prefer[providerId] ?? []) {
    const hit = chat.filter((m) => re.test(m)).sort()[0];
    if (hit) return hit;
  }
  return chat.sort()[0] ?? null;
}
