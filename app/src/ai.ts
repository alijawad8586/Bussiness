export interface AiProvider {
  id: string;
  name: string;
  /** openai = OpenAI-style chat API, gemini = Google, anthropic = Claude */
  kind: 'openai' | 'gemini' | 'anthropic';
  url: string;
  model: string;
  custom?: boolean;
}

export const BUILTIN_PROVIDERS: AiProvider[] = [
  { id: 'openai', name: 'ChatGPT (OpenAI)', kind: 'openai', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'gemini', name: 'Gemini (Google)', kind: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
  { id: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' },
  { id: 'groq', name: 'Groq', kind: 'openai', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
];

export type AiKeys = Record<string, { key: string; model: string }>;

export interface ChatMsg {
  id: string;
  role: 'user' | 'bot';
  text: string;
  error?: boolean;
}

export type Sheet = { name: string; rows: string[][] };

export function systemPrompt(sheet: Sheet | null, useSheet: boolean) {
  let s = 'You are a helpful business assistant for a clinic that messages patients on WhatsApp. Answer simply and clearly.';
  if (useSheet && sheet) {
    const csv = sheet.rows.slice(0, 200).map((r) => r.join(',')).join('\n').slice(0, 12000);
    s += `\n\nThe user uploaded a sheet named "${sheet.name}". Data (CSV, may be truncated):\n${csv}`;
  }
  return s;
}

async function readJson(r: Response) {
  try {
    return await r.json();
  } catch {
    return {};
  }
}

/** Calls the chosen AI directly from the app. `msgs` must be the conversation so far (user/bot only). */
export async function callAI(p: AiProvider, cfg: { key: string; model: string }, msgs: ChatMsg[], system: string) {
  if (p.kind === 'gemini') {
    const r = await fetch(`${p.url}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
      }),
    });
    const j = await readJson(r);
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.candidates?.[0]?.content?.parts?.map((x: { text: string }) => x.text).join('') || '(empty reply)';
  }
  if (p.kind === 'anthropic') {
    const r = await fetch(`${p.url}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system,
        messages: msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      }),
    });
    const j = await readJson(r);
    if (!r.ok) throw new Error(j.error?.message || r.statusText);
    return j.content?.map((x: { text: string }) => x.text).join('') || '(empty reply)';
  }
  const r = await fetch(`${p.url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: system }].concat(
        msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      ),
    }),
  });
  const j = await readJson(r);
  if (!r.ok) throw new Error(j.error?.message || r.statusText);
  return j.choices?.[0]?.message?.content || '(empty reply)';
}
