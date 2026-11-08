import type { DB } from '../db';
import { nowFor, type UserRow } from '../auth';
import { DAY, round2 } from '../util';

export const LEVEL_DEFS = [
  { key: 'huevo', name: 'Huevo', minWeeks: 0, hint: 'Empiezas aquí' },
  { key: 'pollo', name: 'Pollo', minWeeks: 1, hint: '1 semana dentro del presupuesto' },
  { key: 'gallo', name: 'Gallo', minWeeks: 3, hint: '3 semanas seguidas' },
  { key: 'chivo', name: 'Chivo', minWeeks: 6, hint: '6 semanas seguidas' },
  { key: 'goat', name: 'GOAT', minWeeks: 10, hint: '10 semanas seguidas y ahorro cumplido' },
] as const;

export const GOAT_WEEKS = 10;

/** Semanas móviles de 7 días hacia atrás desde "ahora": gasto, ingreso y si quedó dentro del presupuesto. */
export function weeklyStats(db: DB, user: UserRow, weeks = 12) {
  const now = nowFor(user).getTime();
  const allowance = user.weekly_allowance ?? 60;
  const q = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) e,
      COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) i,
      COUNT(*) n FROM movements WHERE user_id=? AND occurred_at>? AND occurred_at<=?`);
  const out: { spent: number; income: number; n: number; within: boolean; saved: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    const to = new Date(now - w * 7 * DAY).toISOString();
    const from = new Date(now - (w + 1) * 7 * DAY).toISOString();
    const r = q.get(user.id, from, to) as { e: number; i: number; n: number };
    out.push({ spent: round2(r.e), income: round2(r.i), n: r.n, within: r.n > 0 && r.e <= allowance, saved: round2(Math.max(0, Math.min(allowance, r.i || allowance) - r.e)) });
  }
  return out; // índice 0 = la semana más reciente
}

export function computeLevels(db: DB, user: UserRow) {
  const weeks = weeklyStats(db, user, 14);
  let streak = 0;
  for (const w of weeks) { if (w.within) streak++; else break; }
  const savingsMet = streak > 0 && weeks.slice(0, streak).reduce((a, w) => a + w.saved, 0) > 0;
  const idx = (() => {
    let i = 0;
    LEVEL_DEFS.forEach((l, k) => { if (streak >= l.minWeeks) i = k; });
    if (i === 4 && !savingsMet) i = 3;
    return i;
  })();
  const levels = LEVEL_DEFS.map((l, k) => ({
    key: l.key, name: l.name, hint: l.hint, minWeeks: l.minWeeks,
    status: k < idx ? 'done' : k === idx ? 'current' : 'locked',
  }));
  return {
    streakWeeks: streak, goatWeeks: GOAT_WEEKS, weeksToGoat: Math.max(0, GOAT_WEEKS - streak),
    savingsMet, level: levels[idx], levelNumber: idx + 1, levels,
    nextLevel: idx < 4 ? { name: LEVEL_DEFS[idx + 1].name, weeksNeeded: Math.max(0, LEVEL_DEFS[idx + 1].minWeeks - streak) } : null,
    allowance: user.weekly_allowance ?? 60,
  };
}
