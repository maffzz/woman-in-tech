/**
 * Motor de puntaje v1 (puro, sin base de datos → fácil de probar).
 * Mide COMPORTAMIENTO (constancia, puntualidad, control), no monto. No es un historial crediticio formal.
 */
import { clamp, DAY, WEEK, round2 } from '../util';

export const SCORING_VERSION = 'v1';
export const WINDOW_DAYS = 90;
export const MIN_WEEKS = 4;

export interface ScMovement { at: string; amount: number; type: 'expense' | 'income'; category: string }
export interface ScOuting { endsAt: string; status: string; withinBudget: boolean | null }
export interface ScLoan {
  direction: 'lent' | 'borrowed';
  amount: number;
  dueDate: string;
  paidAt: string | null;
  onTime: boolean | null;
  remindedAt: string | null;
}
export interface ScInput {
  asOf: Date;
  weeklyAllowance: number | null;
  movements: ScMovement[];
  outings: ScOuting[];
  loans: ScLoan[];
}

export type IndicatorKey = 'spendControl' | 'savings' | 'regularity' | 'onTimePayment' | 'social';
export interface Indicator {
  key: IndicatorKey;
  label: string;
  weight: number;          // peso base
  effectiveWeight: number; // tras redistribuir
  score: number | null;    // 0-100, null si no hay datos
  explanation: string;
}
export const LEVELS = ['Inicial', 'Constante', 'Confiable', 'Sólido'] as const;
export type Level = (typeof LEVELS)[number];

export interface ScoreResult {
  version: string;
  score: number;
  level: Level;
  provisional: boolean; // true si hay < 4 semanas de datos
  weeksOfData: number;
  monthsOfHistory: number;
  nextLevel: { level: Level; pointsNeeded: number } | null;
  indicators: Indicator[];
  tips: string[];
}

const BASE: Record<IndicatorKey, { label: string; weight: number }> = {
  spendControl: { label: 'Control del gasto', weight: 0.25 },
  savings: { label: 'Ahorro', weight: 0.2 },
  regularity: { label: 'Regularidad y gasto razonable', weight: 0.2 },
  onTimePayment: { label: 'Devolver a tiempo', weight: 0.2 },
  social: { label: 'Salidas y cobros', weight: 0.15 },
};

export function levelFor(score: number): Level {
  if (score >= 80) return 'Sólido';
  if (score >= 62) return 'Confiable';
  if (score >= 45) return 'Constante';
  return 'Inicial';
}
const LEVEL_MIN: Record<Level, number> = { Inicial: 0, Constante: 45, Confiable: 62, Sólido: 80 };

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

export function computeScore(input: ScInput): ScoreResult {
  const end = input.asOf.getTime();
  const start = end - WINDOW_DAYS * DAY;
  const mv = input.movements.filter((m) => {
    const t = new Date(m.at).getTime();
    return t > start && t <= end;
  });

  const first = mv.length ? Math.min(...mv.map((m) => new Date(m.at).getTime())) : end;
  const weeksOfData = Math.min(Math.floor((end - first) / WEEK) + (mv.length ? 1 : 0), Math.floor(WINDOW_DAYS / 7));
  const nWeeks = Math.max(1, weeksOfData);

  // Cubetas semanales (0 = la más reciente)
  const spend: number[] = Array(nWeeks).fill(0);
  const income: number[] = Array(nWeeks).fill(0);
  let fun = 0, totalSpend = 0, totalIncome = 0;
  for (const m of mv) {
    const i = Math.min(nWeeks - 1, Math.floor((end - new Date(m.at).getTime()) / WEEK));
    if (m.type === 'expense') {
      spend[i] += m.amount; totalSpend += m.amount;
      if (m.category === 'juegos' || m.category === 'entretenimiento') fun += m.amount;
    } else {
      income[i] += m.amount; totalIncome += m.amount;
    }
  }
  const avgIncome = totalIncome / nWeeks;
  const weeklyBudget = avgIncome > 0 ? avgIncome : input.weeklyAllowance ?? 0;

  // 1) Control del gasto
  let spendControl: number | null = null;
  if (weeklyBudget > 0 && mv.length) {
    const per = spend.map((s) => {
      const ratio = s / weeklyBudget;
      return ratio <= 1 ? 100 : clamp(1 - (ratio - 1) / 0.5, 0, 1) * 100;
    });
    spendControl = mean(per);
  }

  // 2) Ahorro estimado (ingresos - gastos)
  let savings: number | null = null;
  if (totalIncome > 0) savings = clamp((totalIncome - totalSpend) / totalIncome / 0.15, 0, 1) * 100;

  // 3) Regularidad + gasto razonable en juegos/entretenimiento
  let regularity: number | null = null;
  if (weeksOfData >= 2 && totalSpend > 0) {
    const m = mean(spend);
    const cv = m > 0 ? std(spend) / m : 0;
    const cvScore = clamp(1 - (cv - 0.2) / 0.8, 0, 1) * 100;
    const share = fun / totalSpend;
    const funScore = share <= 0.2 ? 100 : clamp(1 - (share - 0.2) / 0.3, 0, 1) * 100;
    regularity = 0.5 * cvScore + 0.5 * funScore;
  }

  // 4) Devolver a tiempo (lo que ella debe). Vencidos sin pagar cuentan como tarde.
  const borrowed = input.loans.filter((l) => {
    if (l.direction !== 'borrowed') return false;
    const due = new Date(l.dueDate).getTime();
    return (l.paidAt !== null || due <= end) && due > start - 30 * DAY;
  });
  let onTimePayment: number | null = null;
  if (borrowed.length) onTimePayment = (borrowed.filter((l) => l.paidAt !== null && l.onTime === true).length / borrowed.length) * 100;

  // 5) Salidas dentro del presupuesto + gestión de cobros (NO premia prestar más ni castiga que otro no pague)
  const parts: number[] = [];
  const outings = input.outings.filter((o) => o.status === 'finished' && o.withinBudget !== null && new Date(o.endsAt).getTime() > start);
  if (outings.length) parts.push((outings.filter((o) => o.withinBudget).length / outings.length) * 100);
  const cap = weeklyBudget > 0 ? weeklyBudget : Infinity; // préstamos más grandes que su semana no suman
  const lent = input.loans.filter((l) => l.direction === 'lent' && l.amount <= cap && new Date(l.dueDate).getTime() > start - 30 * DAY);
  const dueLent = lent.filter((l) => l.paidAt !== null || new Date(l.dueDate).getTime() <= end);
  if (dueLent.length) parts.push((dueLent.filter((l) => l.paidAt !== null || l.remindedAt !== null).length / dueLent.length) * 100);
  const social: number | null = parts.length ? mean(parts) : null;

  const values: Record<IndicatorKey, number | null> = { spendControl, savings, regularity, onTimePayment, social };
  const present = (Object.keys(BASE) as IndicatorKey[]).filter((k) => values[k] !== null);
  const wsum = present.reduce((s, k) => s + BASE[k].weight, 0);

  const explain = (k: IndicatorKey, v: number | null): string => {
    if (v === null) return 'Aún no hay datos para este indicador. Se activa cuando lo uses.';
    const high = v >= 70, mid = v >= 45;
    switch (k) {
      case 'spendControl': return high ? 'Casi siempre te mantienes dentro de lo que recibes.' : mid ? 'Algunas semanas te pasas de lo que recibes.' : 'Muchas semanas gastas más de lo que recibes.';
      case 'savings': return high ? 'Te sobra plata de forma recurrente. ¡Muy bien!' : mid ? 'Ahorras algo, pero podrías apartar un poco más.' : 'Casi no te sobra plata al final del periodo.';
      case 'regularity': return high ? 'Tu gasto es parejo y sin excesos en juegos o entretenimiento.' : mid ? 'Tu gasto tiene algunos picos o un poco de exceso en juegos/entretenimiento.' : 'Hay picos grandes o mucho gasto en juegos/entretenimiento.';
      case 'onTimePayment': return high ? 'Devuelves lo que debes en la fecha acordada.' : mid ? 'A veces te atrasas al devolver.' : 'Te has atrasado varias veces al devolver.';
      case 'social': return high ? 'Respetas tus presupuestos de salida y gestionas bien lo que te deben.' : mid ? 'Te pasas de presupuesto en algunas salidas o dejas cobros sin gestionar.' : 'Cuesta mantener el presupuesto de salidas y gestionar cobros.';
    }
  };

  const indicators: Indicator[] = (Object.keys(BASE) as IndicatorKey[]).map((k) => ({
    key: k,
    label: BASE[k].label,
    weight: BASE[k].weight,
    effectiveWeight: values[k] === null || wsum === 0 ? 0 : round2(BASE[k].weight / wsum),
    score: values[k] === null ? null : Math.round(values[k]!),
    explanation: explain(k, values[k]),
  }));

  const score = wsum === 0 ? 0 : Math.round(present.reduce((s, k) => s + values[k]! * (BASE[k].weight / wsum), 0));
  const level = levelFor(score);
  const idx = LEVELS.indexOf(level);
  const nextLevel = idx < LEVELS.length - 1 ? { level: LEVELS[idx + 1], pointsNeeded: LEVEL_MIN[LEVELS[idx + 1]] - score } : null;

  // Consejos de mejora: los 2 indicadores más bajos
  const tipText: Record<IndicatorKey, string> = {
    spendControl: 'Intenta no pasar de tu mesada en la semana: define un tope para tus gastos del día a día.',
    savings: 'Aparta una parte de tu mesada apenas la recibas, antes de gastar.',
    regularity: 'Reparte tus gastos en la semana y vigila el gasto en juegos y entretenimiento.',
    onTimePayment: 'Devuelve lo que debes antes de la fecha acordada: es la señal más parecida a un historial de pagos.',
    social: 'Fija un presupuesto antes de salir y recuerda a tus amigos lo que te deben con un mensaje amable.',
  };
  const tips = indicators
    .filter((i) => i.score !== null)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 2)
    .map((i) => tipText[i.key]);

  return {
    version: SCORING_VERSION,
    score,
    level,
    provisional: weeksOfData < MIN_WEEKS,
    weeksOfData,
    monthsOfHistory: Math.round((weeksOfData / 4.345) * 10) / 10,
    nextLevel,
    indicators,
    tips,
  };
}
