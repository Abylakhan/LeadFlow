// LeadFlow: ИИ для команды с автоматической сменой ключей.
// Ключи добавляются в Админке → «ИИ» и хранятся в таблице ai_keys, которую сотрудники прочитать не могут.
// Когда ключ упирается в лимит, функция ставит его на паузу и берёт следующий; неверный ключ отключает.
// Supabase → Edge Functions → Deploy a new function → Via Editor → имя «ai» → вставить этот файл → Deploy.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Key = { id: number | string; provider: string; key: string; model: string };
class ProviderError extends Error { constructor(msg: string, public status: number) { super(msg); } }

const PRIORITY: Record<string, number> = { gemini: 0, groq: 1, cerebras: 2, openrouter: 3 };
const MODELS: Record<string, string> = {
  gemini: 'gemini-flash-latest', groq: 'llama-3.3-70b-versatile', cerebras: 'llama-3.3-70b', openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
};
const OPENAI_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

// Google периодически убирает старые модели. Если модель недоступна — берём ту, что советует Google в ошибке,
// затем «последнюю flash»; рабочую модель запоминаем для ключа.
const RETIRED = /no longer available|not found|is not supported|deprecated|does not exist/i;
// перегрузка у Google или долгий ответ — пробуем другую модель того же ключа
const BUSY = /high demand|overloaded|unavailable|try again later|превышено время/i;
const GEMINI_FALLBACK = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];
async function call(k: Key, msgs: Msg[], temperature: number): Promise<{ text: string; model: string }> {
  const tried = new Set<string>(); let lastBusy = false;
  let model = k.model || MODELS[k.provider];
  for (let attempt = 0; attempt < 3; attempt++) {
    tried.add(model);
    try { return { text: await callModel(k, model, msgs, temperature), model: attempt && lastBusy ? (k.model || '') : model }; }
    catch (e) {
      const err = e as ProviderError;
      const busy = BUSY.test(err.message) || err.status === 503 || err.status === 504;
      if (k.provider !== 'gemini' || !(RETIRED.test(err.message) || busy)) throw err;
      const dead = new Set([...err.message.matchAll(/models\/([\w.-]+) is (?:no longer|not)/g)].map(m => m[1]));
      const hint = [...err.message.matchAll(/models\/([\w.-]+)/g)].map(m => m[1].replace(/\.+$/, "")).find(m => !tried.has(m) && !dead.has(m));
      lastBusy = busy;
      const next = (busy ? null : hint) || GEMINI_FALLBACK.find(m => !tried.has(m));
      if (!next) throw err;
      model = next;
    }
  }
  throw new ProviderError('не удалось подобрать модель', 502);
}
async function callModel(k: Key, model: string, msgs: Msg[], temperature: number): Promise<string> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    if (k.provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: msgs.filter(m => m.role === 'system').map(m => m.content).join('\n') || ' ' }] },
          contents: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { temperature, maxOutputTokens: 2048 },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new ProviderError(j.error?.message || `HTTP ${r.status}`, r.status);
      const text = (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
      if (!text) throw new ProviderError('пустой ответ', 502);
      return text;
    }
    const r = await fetch(OPENAI_URLS[k.provider], {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.key}` },
      body: JSON.stringify({ model, messages: msgs, temperature, max_tokens: 2048 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ProviderError(j.error?.message || `HTTP ${r.status}`, r.status);
    const text = j.choices?.[0]?.message?.content || '';
    if (!text) throw new ProviderError('пустой ответ', 502);
    return text;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError((e as Error).name === 'AbortError' ? 'превышено время ожидания' : String((e as Error).message), 504);
  } finally { clearTimeout(t); }
}

// Что делать с ключом после ошибки: пауза (лимит), отключить (ключ неверный) или короткая пауза (сбой сервиса)
function verdict(e: ProviderError): { disable?: boolean; pauseSec: number } {
  const m = e.message.toLowerCase();
  if (e.status === 401 || e.status === 403 || /api key not valid|invalid api key|invalid_api_key|unauthorized|permission denied/.test(m)) return { disable: true, pauseSec: 0 };
  if (e.status === 429 || /quota|rate limit|resource_exhausted|too many/.test(m)) return { pauseSec: /per day|daily|perday/.test(m) ? 3 * 3600 : 90 };
  return { pauseSec: 30 };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!anon || !service) return json({ error: 'На сервере нет ключей проекта (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)' }, 500);
    const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: member } = await user.rpc('is_member');
    if (!member) return json({ error: 'Нет доступа' }, 403);
    const svc = createClient(url, service);

    const body = await req.json().catch(() => ({}));
    let msgs: Msg[]; let only: number | null = null;
    if (body.test_key_id) {
      const { data: admin } = await user.rpc('is_admin');
      if (!admin) return json({ error: 'Только для администратора' }, 403);
      only = Number(body.test_key_id);
      msgs = [{ role: 'user', content: 'Ответь одной короткой фразой по-русски: ты на связи?' }];
    } else {
      if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 40) return json({ error: 'Некорректный запрос' }, 400);
      msgs = body.messages.map((m: { role?: string; content?: unknown }) => ({
        role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
        content: String(m.content ?? '').slice(0, 15000),
      }));
    }
    const temperature = Math.min(Math.max(Number(body.temperature) || 0.7, 0), 1.2);

    // Ключи из Админки + запасные из секретов (GEMINI_API_KEY, GROQ_API_KEY, …; можно несколько через запятую)
    const now = new Date().toISOString();
    let q = svc.from('ai_keys').select('id,provider,key,model,disabled,cooldown_until,last_used_at');
    q = only ? q.eq('id', only) : q.eq('disabled', false);
    const { data: rows, error: kErr } = await q;
    if (kErr) return json({ error: 'База ключей недоступна: ' + kErr.message }, 500);
    const pool: (Key & { last?: string | null })[] = (rows || [])
      .filter(r => only || !r.cooldown_until || r.cooldown_until < now)
      .map(r => ({ id: r.id, provider: r.provider, key: r.key, model: r.model, last: r.last_used_at }));
    if (!only) for (const p of Object.keys(PRIORITY)) {
      (Deno.env.get(`${p.toUpperCase()}_API_KEY`) || '').split(',').map(s => s.trim()).filter(Boolean)
        .forEach((key, i) => pool.push({ id: `env-${p}-${i}`, provider: p, key, model: '', last: null }));
    }
    // лучший провайдер первым; внутри провайдера — давно не использованный (равномерный расход лимитов)
    pool.sort((a, b) => PRIORITY[a.provider] - PRIORITY[b.provider] || String(a.last || '').localeCompare(String(b.last || '')));
    if (!pool.length) {
      const paused = (rows || []).length > 0;
      return json({ error: paused ? 'Все ключи ИИ на паузе из-за лимитов — попробуйте через пару минут или добавьте ещё ключ' : 'ИИ не настроен: добавьте ключ в Админке → «ИИ»' }, 503);
    }

    const errors: string[] = [];
    for (const k of pool.slice(0, 6)) {
      try {
        const { text, model } = await call(k, msgs, temperature);
        if (typeof k.id === 'number') {
          const { data: cur } = await svc.from('ai_keys').select('uses').eq('id', k.id).single();
          await svc.from('ai_keys').update({ uses: (cur?.uses || 0) + 1, last_used_at: new Date().toISOString(), last_error: null, cooldown_until: null, disabled: false, ...(model && model !== k.model && model !== MODELS[k.provider] ? { model } : {}) }).eq('id', k.id);
        }
        return json({ text, provider: k.provider, switched: errors.length });
      } catch (e) {
        const err = e as ProviderError; const v = verdict(err);
        errors.push(`${k.provider}: ${err.message}`);
        if (typeof k.id === 'number') {
          const { data: cur } = await svc.from('ai_keys').select('fails').eq('id', k.id).single();
          await svc.from('ai_keys').update({
            fails: (cur?.fails || 0) + 1, last_error: err.message.slice(0, 300),
            disabled: v.disable || false,
            cooldown_until: v.pauseSec ? new Date(Date.now() + v.pauseSec * 1000).toISOString() : null,
          }).eq('id', k.id);
        }
      }
    }
    return json({ error: 'ИИ временно недоступен: ' + errors.join(' | ') }, 502);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
