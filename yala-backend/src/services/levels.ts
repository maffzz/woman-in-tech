import type { DB } from '../db';
import { nowFor, type UserRow } from '../auth';
import { DAY, round2 } from '../util';

export const LEVEL_DEFS = [
  { key: 'pollito',  name: 'Pollito',  minWeeks: 0,  hint: 'Empiezas aquí' },
  { key: 'colibri',  name: 'Colibrí',  minWeeks: 1,  hint: '1 semana dentro del presupuesto' },
  { key: 'conejo',   name: 'Conejo',   minWeeks: 4,  hint: '4 semanas seguidas' },
  { key: 'oveja',    name: 'Oveja',    minWeeks: 12, hint: '12 semanas seguidas' },
  { key: 'goat',     name: 'GOAT',     minWeeks: 0,  hint: 'La racha completa hasta los 18 y ahorro cumplido' },
] as const;

export type LevelKey = (typeof LEVEL_DEFS)[number]['key'];

/**
 * Calcula cuántas semanas necesita el usuario para llegar a GOAT.
 * Si tiene fecha de nacimiento: semanas que faltan para cumplir 18 años.
 * Si no: 52 semanas (1 año) como meta por defecto.
 */
export function weeksToGoatFor(user: UserRow): number {
  if (user.birth_date) {
    const now = nowFor(user);
    const birth = new Date(user.birth_date);
    const turns18 = new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate());
    const msLeft = turns18.getTime() - now.getTime();
    if (msLeft <= 0) return 0; // ya tiene 18
    return Math.max(1, Math.ceil(msLeft / (7 * DAY)));
  }
  return 52; // meta por defecto: 1 año
}

/** Semanas móviles de 7 días hacia atrás desde "ahora". */
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
    // w=0 es la semana en curso (todavía no terminó): no cuenta para la racha.
    // Solo semanas completadas (w >= 1) con al menos 1 movimiento pueden contar.
    const completed = w >= 1;
    out.push({ spent: round2(r.e), income: round2(r.i), n: r.n, within: completed && r.n > 0 && r.e <= allowance, saved: round2(Math.max(0, Math.min(allowance, r.i || allowance) - r.e)) });
  }
  return out; // índice 0 = semana en curso (no cuenta para racha)
}

export function computeLevels(db: DB, user: UserRow) {
  const goatWeeks = weeksToGoatFor(user);
  // Para calcular la racha necesitamos ver todas las semanas hasta la meta
  const weeksToCheck = Math.max(14, goatWeeks + 4);
  const weeks = weeklyStats(db, user, weeksToCheck);

  let streak = 0;
  // weeks[0] es la semana actual (no terminada, no cuenta para la racha).
  // La racha empieza en weeks[1] (semana pasada más reciente) hacia atrás.
  for (let i = 1; i < weeks.length; i++) { if (weeks[i].within) streak++; else break; }

  const savingsMet = streak > 0 && weeks.slice(0, streak).reduce((a, w) => a + w.saved, 0) > 0;

  // Ya tiene 18 y cumplió la racha completa → GOAT
  const isGoat = goatWeeks === 0 ? savingsMet : streak >= goatWeeks && savingsMet;

  const idx = (() => {
    if (isGoat) return 4;
    let i = 0;
    // LEVEL_DEFS[4] es goat, lo excluimos de la progresión normal
    LEVEL_DEFS.slice(0, 4).forEach((l, k) => { if (streak >= l.minWeeks) i = k; });
    return i;
  })();

  const levels = LEVEL_DEFS.map((l, k) => ({
    key: l.key, name: l.name, hint: l.hint, minWeeks: l.minWeeks,
    status: (k < idx ? 'done' : k === idx ? 'current' : 'locked') as 'done' | 'current' | 'locked',
  }));

  // Calcular días hasta los 18 para mostrar en UI
  let daysTo18: number | null = null;
  if (user.birth_date) {
    const now = nowFor(user);
    const birth = new Date(user.birth_date);
    const turns18 = new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate());
    const msLeft = turns18.getTime() - now.getTime();
    daysTo18 = msLeft > 0 ? Math.ceil(msLeft / DAY) : 0;
  }

  return {
    streakWeeks: streak,
    goatWeeks,
    weeksToGoat: Math.max(0, goatWeeks - streak),
    savingsMet,
    level: levels[idx],
    levelNumber: idx + 1,
    levels,
    daysTo18,
    nextLevel: idx < 4 ? { name: LEVEL_DEFS[idx + 1].name, weeksNeeded: Math.max(0, LEVEL_DEFS[idx + 1].minWeeks - streak) } : null,
    allowance: user.weekly_allowance ?? 60,
  };
}
