/**
 * Parser de notificaciones de pago electrónico (Yape + BCP).
 *
 * Formatos confirmados:
 *   - BCP (notificaciones@notificacionesbcp.com.pe):
 *       "Realizaste un consumo de S/ 29.00 con tu Tarjeta de Débito BCP en IZI*ALESAR ALM*00562153"
 *       Fecha en el asunto o en el cuerpo: "nov 3" / "3 de noviembre"
 *
 *   - Yape (notificaciones@yape.com.pe) — formato NO confirmado con correos reales:
 *       Se asume "¡Yapeaste S/ X!" / "Te yapearon S/ X"
 *       Ajustar con correos reales cuando los tengan (ver tests/parser.test.ts).
 *
 * Si el parser falla, parseYapeWithFallback() intenta con IA y, si no, guarda como "no leído".
 */
import { norm } from '../util';

export interface ParsedYape {
  amount: number;
  type: 'expense' | 'income';
  counterparty: string | null;
  occurredAt: string; // ISO
}

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  setiembre: 8, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11,
};

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function parseAmount(text: string): number | null {
  const m = text.match(/S\/\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (!m) return null;
  let raw = m[1];
  // "1,234.50" | "1.234,50" | "12,50" | "12.50"
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    raw = lastComma > lastDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (lastComma > -1) {
    raw = /,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(text: string, fallback: Date): string {
  // 07 nov. 2026 - 10:15 a. m.  |  7 de noviembre de 2026, 10:15 p. m.  |  07/11/2026 10:15
  const t = norm(text);
  let y: number, mo: number, d: number;
  let m = t.match(/(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+)?(\d{4})/);
  if (m && MONTHS[m[2]] !== undefined) {
    d = +m[1]; mo = MONTHS[m[2]]; y = +m[3];
  } else if ((m = t.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/))) {
    d = +m[1]; mo = +m[2] - 1; y = +m[3];
  } else {
    return fallback.toISOString();
  }
  const tm = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/);
  let hh = tm ? +tm[1] : 12;
  const mm = tm ? +tm[2] : 0;
  if (tm?.[3]) {
    const pm = tm[3].startsWith('p');
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  // Lima = UTC-5 (sin horario de verano)
  return new Date(Date.UTC(y, mo, d, hh + 5, mm)).toISOString();
}

export function parseYapeText(raw: string, fallbackDate = new Date()): ParsedYape | null {
  const text = /<[a-z][\s\S]*>/i.test(raw) ? stripHtml(raw) : raw;
  const n = norm(text);

  // ── BCP: "Realizaste un consumo de S/ X con tu Tarjeta de Débito BCP en COMERCIO" ──
  // ── BCP: "Recibiste un yapeo de S/ X de NOMBRE" (ingreso) ──
  const bcpExpense = /realizaste un consumo de\s+S\/\.?\s*[\d.,]+|consumo con tu tarjeta(?:.*?bcp)?|tarjeta de debito bcp/i;
  const bcpYapeoIncome = /recibiste un yapeo de\s+S\/|recibiste un yapeo/i;
  const bcpIncome = /abono en tu cuenta|deposito en tu cuenta bcp/i;

  if (bcpYapeoIncome.test(text)) {
    // "Recibiste un yapeo de S/ 50.00 de Zuniga Castaneda Humberto Alvaro"
    const amount = parseAmount(text);
    if (!amount) return null;
    // Extrae el remitente: "de [Nombre]" después del monto, o campo "Enviado por"
    let counterparty: string | null = null;
    const cpEnviadoPor = text.match(/enviado por\s*[:\-]?\s*([^\n\r]{3,60})/i);
    const cpDe = text.match(/recibiste un yapeo de\s+S\/[\d.,]+\s+de\s+([^\n\r.]{3,60})/i);
    if (cpEnviadoPor) counterparty = cpEnviadoPor[1].replace(/\s{2,}/g, ' ').trim();
    else if (cpDe) counterparty = cpDe[1].replace(/\s{2,}/g, ' ').trim();
    return { amount, type: 'income', counterparty, occurredAt: parseDate(text, fallbackDate) };
  }
  if (bcpExpense.test(text)) {
    const amount = parseAmount(text);
    if (!amount) return null;
    // Extrae el comercio después de "en ": captura hasta punto, salto, fin de línea o fin de string.
    // Usa m-flag para que $ y ^ coincidan con fin/inicio de línea.
    let counterparty: string | null = null;
    const cpBcp = text.match(/\ben\s+([\w*+.\-& ]{2,60}?)[\s]*(?:\.|,|\n|$)/im);
    if (cpBcp) {
      counterparty = cpBcp[1]
        .replace(/S\/\.?\s*[\d.,]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (counterparty.length < 2) counterparty = null;
    }
    // Fallback: último token que parezca un comercio (ej. "TAMBO+" al final de la frase)
    if (!counterparty) {
      const fallbackCp = text.match(/\ben\s+([A-Z][A-Z0-9*+.\- ]{2,40})\s*\.?\s*$/im);
      if (fallbackCp) {
        counterparty = fallbackCp[1].trim();
        if (counterparty.length < 2) counterparty = null;
      }
    }
    return { amount, type: 'expense', counterparty, occurredAt: parseDate(text, fallbackDate) };
  }
  if (bcpIncome.test(text)) {
    const amount = parseAmount(text);
    if (!amount) return null;
    return { amount, type: 'income', counterparty: null, occurredAt: parseDate(text, fallbackDate) };
  }

  // Tipo (Yape)
  let type: 'expense' | 'income' | null = null;
  if (/te yape(aron|o)|recibiste|has recibido|te enviaron|te han yapeado/.test(n)) type = 'income';
  else if (/yapeaste|enviaste|pagaste|constancia de (pago|transferencia)|realizaste|has yapeado|yape enviado/.test(n)) type = 'expense';
  if (!type) return null;

  const amount = parseAmount(text);
  if (!amount) return null;

  // Contraparte
  let counterparty: string | null = null;
  const patterns = [
    /(?:destinatario|beneficiario|nombre del destinatario|enviado a|para)\s*[:\-]?\s*([^\n\r|]{2,60})/i,
    /(?:origen|remitente|enviado por|de parte de|te yapeo|te yapearon)\s*[:\-]?\s*([^\n\r|]{2,60})/i,
    /yapeaste\s+S\/\.?\s*[\d.,]+\s+a\s+([^\n\r|.]{2,60})/i,
    /([^\n\r|]{2,60})\s+te\s+yape(?:o|aron)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      counterparty = m[1]
        .replace(/S\/\.?\s*[\d.,]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[.,;:]+$/, '')
        .trim();
      if (counterparty.length >= 2) break;
      counterparty = null;
    }
  }

  return { amount, type, counterparty, occurredAt: parseDate(text, fallbackDate) };
}

/** Si el parser por patrones falla, se llama a `aiExtract` (opcional) como respaldo. */
export async function parseYapeWithFallback(
  raw: string,
  aiExtract?: (text: string) => Promise<ParsedYape | null>,
  fallbackDate = new Date(),
): Promise<{ parsed: ParsedYape | null; via: 'regex' | 'ai' | 'none' }> {
  const p = parseYapeText(raw, fallbackDate);
  if (p) return { parsed: p, via: 'regex' };
  if (aiExtract) {
    try {
      const a = await aiExtract(raw.slice(0, 4000));
      if (a) return { parsed: a, via: 'ai' };
    } catch {
      /* se ignora: queda como no leído */
    }
  }
  return { parsed: null, via: 'none' };
}

/** Separa varios correos pegados en un solo texto (separados por una línea con --- o 2+ saltos). */
export function splitPasted(text: string): string[] {
  return text
    .split(/\n\s*-{3,}\s*\n|\n{3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
