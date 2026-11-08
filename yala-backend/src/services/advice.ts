import type { DB } from '../db';
import { nowFor, type UserRow } from '../auth';
import { generateAdvice, type AdviceContext } from './ai';
import { DAY, isoDate, round2 } from '../util';

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function buildAdviceContext(db: DB, user: UserRow): AdviceContext {
  const now = nowFor(user);
  const from14 = new Date(now.getTime() - 14 * DAY).toISOString();
  const from7 = new Date(now.getTime() - 7 * DAY).toISOString();
  const cats = db
    .prepare(
      `SELECT category, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<=?
       GROUP BY category ORDER BY s DESC LIMIT 3`,
    )
    .all(user.id, from14, now.toISOString()) as { category: string; s: number }[];
  const weekSpent = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<=?`)
    .get(user.id, from7, now.toISOString()) as { s: number }).s;
  const inc = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='income' AND occurred_at>=? AND occurred_at<=?`)
    .get(user.id, from7, now.toISOString()) as { s: number }).s;
  const allowance = inc > 0 ? inc : user.weekly_allowance ?? 60;
  const loans = db
    .prepare(`SELECT friend_nickname f, amount, direction, due_date d FROM loans WHERE user_id=? AND paid_at IS NULL ORDER BY due_date LIMIT 5`)
    .all(user.id) as { f: string; amount: number; direction: string; d: string }[];
  const prev = db
    .prepare('SELECT text FROM advices WHERE user_id=? ORDER BY day DESC LIMIT 7')
    .all(user.id) as { text: string }[];
  return {
    dayOfWeek: DOW[new Date(now.getTime() - 5 * 3600_000).getUTCDay()],
    weekSpent: round2(weekSpent),
    weekAllowance: round2(allowance),
    weekPctSpent: allowance > 0 ? Math.round((weekSpent / allowance) * 100) : 0,
    topCategories: cats.map((c) => ({ category: c.category, amount: round2(c.s) })),
    dueSoon: loans.map((l) => ({
      friend: l.f,
      amount: l.amount,
      direction: l.direction,
      dueInDays: Math.ceil((new Date(l.d).getTime() - now.getTime()) / DAY),
    })),
    previousAdvices: prev.map((p) => p.text),
  };
}

/** Un consejo por usuario por día (se guarda en cache). */
export async function adviceForToday(db: DB, user: UserRow, force = false) {
  const day = isoDate(nowFor(user));
  if (!force) {
    const ex = db.prepare('SELECT text, source FROM advices WHERE user_id=? AND day=?').get(user.id, day) as
      | { text: string; source: string }
      | undefined;
    if (ex) return { day, text: ex.text, source: ex.source };
  }
  const g = await generateAdvice(buildAdviceContext(db, user));
  db.prepare(
    `INSERT INTO advices (user_id, day, text, source) VALUES (?,?,?,?)
     ON CONFLICT(user_id, day) DO UPDATE SET text=excluded.text, source=excluded.source`,
  ).run(user.id, day, g.text, g.source);
  return { day, text: g.text, source: g.source };
}
