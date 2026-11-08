import type { DB } from '../db';
import { nowFor, type UserRow } from '../auth';
import { computeScore, SCORING_VERSION, type ScoreResult } from './scoring';

export function computeProfile(db: DB, user: UserRow): ScoreResult {
  const movements = (db
    .prepare('SELECT occurred_at at, amount, type, category FROM movements WHERE user_id=?')
    .all(user.id) as { at: string; amount: number; type: 'expense' | 'income'; category: string }[]);
  const outings = (db
    .prepare('SELECT ends_at endsAt, status, within_budget wb FROM outings WHERE user_id=?')
    .all(user.id) as { endsAt: string; status: string; wb: number | null }[]).map((o) => ({
    endsAt: o.endsAt,
    status: o.status,
    withinBudget: o.wb === null ? null : !!o.wb,
  }));
  const loans = (db
    .prepare('SELECT direction, amount, due_date dueDate, paid_at paidAt, on_time ot, reminded_at remindedAt FROM loans WHERE user_id=?')
    .all(user.id) as any[]).map((l) => ({
    direction: l.direction,
    amount: l.amount,
    dueDate: l.dueDate,
    paidAt: l.paidAt,
    onTime: l.ot === null ? null : !!l.ot,
    remindedAt: l.remindedAt,
  }));
  return computeScore({
    asOf: nowFor(user),
    weeklyAllowance: user.weekly_allowance,
    movements,
    outings,
    loans,
  });
}

export function saveSnapshot(db: DB, user: UserRow, r: ScoreResult) {
  db.prepare(
    `INSERT INTO profile_history (user_id, computed_at, version, score, level, indicators_json, weeks_of_data)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(user.id, nowFor(user).toISOString(), SCORING_VERSION, r.score, r.level, JSON.stringify(r.indicators), r.weeksOfData);
}
