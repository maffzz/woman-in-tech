import type { DB } from '../db';
import type { UserRow } from '../auth';
import { nowFor } from '../auth';
import { CATEGORIES, type Category } from '../config';
import { classifyAndOpine, type MonthContext } from './ai';
import { monthKey, monthRange, norm, prevMonthKey, round2 } from '../util';

export interface MovementRow {
  id: number;
  user_id: number;
  occurred_at: string;
  amount: number;
  type: 'expense' | 'income';
  counterparty: string | null;
  category: string;
  ai_opinion: string | null;
  origin: string;
  verified: number;
  email_id: string | null;
  category_corrected: number;
}

export const toMovementDto = (m: MovementRow) => ({
  id: m.id,
  occurredAt: m.occurred_at,
  amount: m.amount,
  type: m.type,
  counterparty: m.counterparty,
  category: m.category,
  aiOpinion: m.ai_opinion,
  origin: m.origin,
  verified: !!m.verified,
  categoryCorrected: !!m.category_corrected,
});

export function categoryTotals(db: DB, userId: number, key: string): Record<string, number> {
  const { from, to } = monthRange(key);
  const rows = db
    .prepare(
      `SELECT category, SUM(amount) s FROM movements
       WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<? GROUP BY category`,
    )
    .all(userId, from, to) as { category: string; s: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = round2(r.s);
  return out;
}

export function monthContext(db: DB, userId: number, key: string): MonthContext {
  const byCategory = categoryTotals(db, userId, key);
  const prevByCategory = categoryTotals(db, userId, prevMonthKey(key));
  const sum = (o: Record<string, number>) => round2(Object.values(o).reduce((a, b) => a + b, 0));
  return { byCategory, prevByCategory, total: sum(byCategory), prevTotal: sum(prevByCategory) };
}

export function ruleFor(db: DB, userId: number, counterparty: string | null): Category | null {
  if (!counterparty) return null;
  const r = db
    .prepare('SELECT category FROM category_rules WHERE user_id=? AND counterparty=?')
    .get(userId, norm(counterparty)) as { category: string } | undefined;
  return r && (CATEGORIES as readonly string[]).includes(r.category) ? (r.category as Category) : null;
}

export interface NewMovement {
  occurredAt: string;
  amount: number;
  type: 'expense' | 'income';
  counterparty?: string | null;
  category?: Category;
  origin: 'demo' | 'gmail' | 'pegado' | 'manual';
  verified?: boolean;
  emailId?: string | null;
}

/** Inserta un movimiento (evitando duplicados por email_id) y le asigna categoría + opinión de la IA. */
export async function addMovement(db: DB, user: UserRow, m: NewMovement): Promise<{ row: MovementRow; duplicated: boolean }> {
  if (m.emailId) {
    const dup = db.prepare('SELECT * FROM movements WHERE user_id=? AND email_id=?').get(user.id, m.emailId) as MovementRow | undefined;
    if (dup) return { row: dup, duplicated: true };
  }
  const key = monthKey(new Date(m.occurredAt));
  const ctx = monthContext(db, user.id, key);
  const rule = ruleFor(db, user.id, m.counterparty ?? null);
  const c = await classifyAndOpine({ amount: m.amount, type: m.type, counterparty: m.counterparty ?? null }, ctx, m.category ?? rule);
  const info = db
    .prepare(
      `INSERT INTO movements (user_id, occurred_at, amount, type, counterparty, category, ai_opinion, origin, verified, email_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(user.id, m.occurredAt, round2(m.amount), m.type, m.counterparty ?? null, m.category ?? c.category, c.opinion, m.origin, m.verified ? 1 : 0, m.emailId ?? null);
  const row = db.prepare('SELECT * FROM movements WHERE id=?').get(info.lastInsertRowid) as MovementRow;
  return { row, duplicated: false };
}

export function listMovements(
  db: DB,
  userId: number,
  f: { from?: string; to?: string; category?: string; type?: string; limit?: number; offset?: number },
): MovementRow[] {
  const where = ['user_id=?'];
  const args: (string | number)[] = [userId];
  if (f.from) { where.push('occurred_at>=?'); args.push(f.from); }
  if (f.to) { where.push('occurred_at<?'); args.push(f.to); }
  if (f.category) { where.push('category=?'); args.push(f.category); }
  if (f.type) { where.push('type=?'); args.push(f.type); }
  args.push(Math.min(f.limit ?? 100, 500), f.offset ?? 0);
  return db
    .prepare(`SELECT * FROM movements WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args) as MovementRow[];
}

/** Cambia la categoría y guarda la regla por destinatario para movimientos futuros. */
export function correctCategory(db: DB, userId: number, id: number, category: Category, applyToSame = true) {
  const m = db.prepare('SELECT * FROM movements WHERE id=? AND user_id=?').get(id, userId) as MovementRow | undefined;
  if (!m) return null;
  db.prepare('UPDATE movements SET category=?, category_corrected=1 WHERE id=?').run(category, id);
  if (m.counterparty) {
    db.prepare(
      `INSERT INTO category_rules (user_id, counterparty, category) VALUES (?,?,?)
       ON CONFLICT(user_id, counterparty) DO UPDATE SET category=excluded.category`,
    ).run(userId, norm(m.counterparty), category);
    if (applyToSame)
      db.prepare(`UPDATE movements SET category=? WHERE user_id=? AND type='expense' AND counterparty IS NOT NULL AND lower(counterparty)=lower(?) AND category_corrected=0`)
        .run(category, userId, m.counterparty);
  }
  return db.prepare('SELECT * FROM movements WHERE id=?').get(id) as MovementRow;
}

export const userNowIso = (u: UserRow) => nowFor(u).toISOString();
