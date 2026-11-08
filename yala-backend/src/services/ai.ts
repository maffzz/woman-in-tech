import { CATEGORIES, config, type Category } from '../config';
import { norm } from '../util';
import type { ParsedYape } from './yapeParser';

export interface MonthContext {
  byCategory: Record<string, number>;
  prevByCategory: Record<string, number>;
  total: number;
  prevTotal: number;
}
export interface MovementInput {
  amount: number;
  type: 'expense' | 'income';
  counterparty: string | null;
}

// ---------- Selección de proveedor ----------

export const aiIsReal = () => {
  if (config.aiMode === 'cache') return false;
  if (config.aiProvider === 'gemini') return !!config.geminiKey;
  // claude o auto
  return config.aiMode === 'real' || (config.aiMode === 'auto' && !!config.anthropicKey);
};

// ---------- Semáforo de concurrencia (evita reventar el cupo por minuto de Gemini free) ----------
let _running = 0;
const _MAX_CONCURRENT = 2;
const _queue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (_running < _MAX_CONCURRENT) { _running++; return Promise.resolve(); }
  return new Promise<void>((resolve) => _queue.push(resolve));
}

function releaseSlot() {
  const next = _queue.shift();
  if (next) { next(); } else { _running--; }
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try { return await fn(); } finally { releaseSlot(); }
}

// ---------- Llamada a Claude (Anthropic) ----------

async function callClaude(system: string, user: string, maxTokens = 300): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

// ---------- Llamada a Gemini (Google) ----------

async function callGeminiOnce(system: string, user: string, maxTokens = 300, wantJson = false): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(wantJson ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.geminiKey,  // clave en header, nunca en la URL
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 || res.status >= 500) throw new Error(`Gemini API ${res.status}`);
  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function callGemini(system: string, user: string, maxTokens = 300, wantJson = false): Promise<string> {
  return withSlot(async () => {
    try {
      return await callGeminiOnce(system, user, maxTokens, wantJson);
    } catch (err) {
      // 1 reintento automático ante 429/5xx/timeout
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || msg.includes('5') || msg.includes('timeout') || msg.includes('AbortError')) {
        await new Promise((r) => setTimeout(r, 1500));
        return await callGeminiOnce(system, user, maxTokens, wantJson);
      }
      throw err;
    }
  });
}

// ---------- Router unificado (callLLM) ----------

/**
 * Llama al proveedor configurado (Gemini o Claude).
 * Si el proveedor falla, lanza el error para que el caller haga fallback a plantillas.
 * @param wantJson true = pídele al modelo que responda JSON (Gemini lo garantiza; Claude ya lo hace por prompt)
 */
async function callLLM(system: string, user: string, maxTokens = 300, wantJson = false): Promise<string> {
  if (config.aiProvider === 'gemini') return callGemini(system, user, maxTokens, wantJson);
  return callClaude(system, user, maxTokens);
}

// ---------- Helpers JSON ----------

function extractJson<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('sin JSON');
  return JSON.parse(m[0]) as T;
}

// ---------- Clasificación por palabras clave (respaldo / modo cache) ----------

const KEYWORDS: [Category, RegExp][] = [
  ['recargas', /claro|movistar|entel|bitel|recarga|saldo/],
  ['juegos', /free ?fire|roblox|steam|play ?station|xbox|google play|garena|fortnite|minecraft|juego|gaming|robux|pase de batalla/],
  ['suscripciones', /netflix|spotify|youtube premium|disney|hbo|prime video|icloud|crunchyroll|suscripcion|membresia/],
  ['entretenimiento', /cine|cineplanet|cinemark|youtube|tiktok|concierto|entrada/],
  ['transporte', /taxi|uber|cabify|indrive|bus|combi|metro|pasaje|movilidad|gasolina|izi\*|grin/],
  ['comida', /kiosco|bodega|tambo|oxxo|mass|metro |wong|vivanda|pizza|burger|bembos|kfc|pollo|menu|cafe|starbucks|panaderia|snack|dulce|helado|chifa|polleria|restaurante|almuerzo|lunch|juguer|alm\*|bcp.*alm|izi.*alm/],
  ['salidas', /salida|karaoke|discoteca|bowling|parque|fiesta|cumple|plaza|mall|boliche/],
  ['ahorro', /ahorro|meta/],
];

export function classifyByKeywords(counterparty: string | null, amount: number): Category {
  const n = norm(counterparty ?? '');
  for (const [cat, re] of KEYWORDS) if (re.test(n)) return cat;
  if (amount <= 8) return 'comida';
  return 'otros';
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export function opinionTemplate(cat: Category, amount: number, ctx: MonthContext): string {
  const spent = ctx.byCategory[cat] ?? 0;
  const prev = ctx.prevByCategory[cat] ?? 0;
  const delta = pct(spent, prev);
  const S = (n: number) => `S/ ${n.toFixed(2).replace(/\.00$/, '')}`;
  switch (cat) {
    case 'juegos':
      return delta !== null && delta > 30
        ? `Llevas ${S(spent)} en juegos este mes, ${delta}% más que el mes pasado. ¿Te está valiendo la pena?`
        : `${S(amount)} en juegos. Está bien mientras no se repita muchas veces en la semana.`;
    case 'entretenimiento':
      return `${S(amount)} en entretenimiento. Es normal si no se repite mucho esta semana.`;
    case 'comida':
      return amount <= 10
        ? `${S(amount)} en comida. Los gastos chicos suman: llevas ${S(spent)} este mes en esto.`
        : `${S(amount)} en comida. Todo bien, es parte del día a día.`;
    case 'recargas':
      return `${S(amount)} en recarga. Si es seguido, quizá te conviene un plan fijo.`;
    case 'transporte':
      return `${S(amount)} en transporte. Gasto necesario, nada raro.`;
    case 'salidas':
      return `${S(amount)} en salidas. Salir es parte de la vida; lo clave es no pasarte de lo que planeaste.`;
    case 'ahorro':
      return `${S(amount)} apartados para ahorro. ¡Buen hábito!`;
    default:
      return `${S(amount)} registrados. Si quieres, ponle una categoría para entenderlo mejor.`;
  }
}

export interface Classification {
  category: Category;
  opinion: string;
  source: 'ai' | 'cache';
}

export async function classifyAndOpine(
  m: MovementInput,
  ctx: MonthContext,
  ruleCategory?: Category | null,
): Promise<Classification> {
  if (m.type === 'income') {
    return {
      category: 'otros',
      opinion: `Ingreso de S/ ${m.amount.toFixed(2).replace(/\.00$/, '')} registrado.`,
      source: 'cache',
    };
  }
  if (aiIsReal()) {
    try {
      const system =
        'Eres Yala, un asistente financiero amigable para adolescentes peruanos de 15 a 17 años. ' +
        'Clasificas gastos y opinas en UNA frase corta, cálida, sin regañar ni sermonear. ' +
        `Categorías válidas: ${CATEGORIES.join(', ')}. Responde SOLO un JSON: {"category":"...","opinion":"..."}.`;
      const user = JSON.stringify({
        movimiento: { monto_soles: m.amount, destinatario: m.counterparty },
        categoria_fijada_por_el_usuario: ruleCategory ?? null,
        gasto_del_mes_por_categoria: ctx.byCategory,
        gasto_mes_anterior_por_categoria: ctx.prevByCategory,
      });
      const raw = await callLLM(system, user, 200, true);
      const out = extractJson<{ category: string; opinion: string }>(raw);
      const aiCat = ((CATEGORIES as readonly string[]).includes(out.category) ? out.category : 'otros') as Category;
      if (out.opinion && out.opinion.length < 300)
        return { category: ruleCategory ?? aiCat, opinion: out.opinion, source: 'ai' };
    } catch {
      /* cae al modo cache */
    }
  }
  const category = ruleCategory ?? classifyByKeywords(m.counterparty, m.amount);
  return { category, opinion: opinionTemplate(category, m.amount, ctx), source: 'cache' };
}

/**
 * Respaldo con IA para extraer datos de un correo que el parser de regex no entendió.
 * NUNCA se manda el cuerpo completo: se trunca a 2000 chars y se pide solo los datos mínimos.
 */
export async function aiExtractYape(text: string): Promise<ParsedYape | null> {
  if (!aiIsReal()) return null;
  try {
    const system =
      'Extrae datos de una notificación de pago electrónico (Yape, BCP u otro banco peruano). ' +
      'Responde SOLO JSON: ' +
      '{"amount":number,"type":"expense"|"income","counterparty":string|null,"occurredAt":"ISO 8601 UTC"} ' +
      'o {"error":"no_es_pago"} si no es un movimiento de dinero. ' +
      '"expense" si el usuario pagó/consumió, "income" si recibió. ' +
      'counterparty: nombre del comercio o persona (sin datos personales extras).';
    // Solo enviamos el texto mínimo: nunca el cuerpo completo del correo
    const out = extractJson<Partial<ParsedYape> & { error?: string }>(
      await callLLM(system, text.slice(0, 2000), 200, true),
    );
    if (out.error || !out.amount || !out.type || !out.occurredAt) return null;
    return {
      amount: Number(out.amount),
      type: out.type,
      counterparty: out.counterparty ?? null,
      occurredAt: new Date(out.occurredAt).toISOString(),
    };
  } catch {
    return null;
  }
}

export interface AdviceContext {
  dayOfWeek: string;
  weekSpent: number;
  weekAllowance: number;
  weekPctSpent: number;
  topCategories: { category: string; amount: number }[];
  dueSoon: { friend: string; amount: number; direction: string; dueInDays: number }[];
  previousAdvices: string[];
}

export function adviceTemplate(c: AdviceContext): string {
  const S = (n: number) => `S/ ${Math.round(n)}`;
  const due = c.dueSoon.find((d) => d.direction === 'borrowed' && d.dueInDays <= 2);
  if (due)
    return `Se acerca la fecha de lo que le debes a ${due.friend} (${S(due.amount)}). Yapéale a tiempo y suma puntos en tu perfil.`;
  const owed = c.dueSoon.find((d) => d.direction === 'lent' && d.dueInDays <= 0);
  if (owed) return `${owed.friend} ya debería devolverte ${S(owed.amount)}. Pídeselo con un mensaje amable, sin roche.`;
  if (c.weekPctSpent >= 80)
    return `Hoy es ${c.dayOfWeek} y ya usaste el ${c.weekPctSpent}% de tu semana. Si guardas lo que queda, llegas a la siguiente mesada con aire.`;
  const top = c.topCategories[0];
  if (top && top.category !== 'otros')
    return `Tu mayor gasto de estos días fue ${top.category} (${S(top.amount)}). Antes de la próxima compra, pregúntate si lo vale.`;
  return `Vas bien esta semana: usaste el ${c.weekPctSpent}% de tu plata. Si te sobra algo, aparta una parte para tu meta.`;
}

export async function generateAdvice(c: AdviceContext): Promise<{ text: string; source: 'ai' | 'cache' }> {
  if (aiIsReal()) {
    try {
      const system =
        'Eres Yala, asistente financiero amigable para adolescentes peruanos. Da UN consejo del día de máximo 2 frases, ' +
        'concreto, con montos en soles, tono cálido, jamás regañes. No repitas consejos previos. No recomiendes productos financieros. ' +
        'Si hay una deuda por vencer, menciónala. Responde solo el texto del consejo, sin comillas ni explicaciones extra.';
      const text = (await callLLM(system, JSON.stringify(c), 200, false)).trim();
      if (text && text.length < 400) return { text, source: 'ai' };
    } catch {
      /* cache */
    }
  }
  return { text: adviceTemplate(c), source: 'cache' };
}
