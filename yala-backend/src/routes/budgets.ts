import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth, type UserRow } from '../auth';
import { CATEGORIES } from '../config';
import { DAY, norm, round2, wrap } from '../util';
import { computeLevels } from '../services/levels';

const cat = z.enum(CATEGORIES);

/** Reparto por defecto (porcentajes) cuando el usuario no pide nada especial. */
const BASE: Record<string, number> = { comida: 35, salidas: 25, transporte: 15, suscripciones: 10, ahorro: 10, otros: 5 };

const KEY: [string, RegExp][] = [
  ['comida', /comer|comida|almuerzo|menu|snack|kiosco/], ['salidas', /salir|salidas|amig|fiesta|cine|pana/],
  ['transporte', /transporte|taxi|combi|bus|pasaje|movilidad/], ['suscripciones', /suscrip|netflix|spotify|streaming/],
  ['ahorro', /ahorr|guardar|meta/],
];

export function buildPlan(weekly: number, message: string) {
  const n = norm(message);
  const pri = KEY.filter(([, re]) => re.test(n)).map(([k]) => k).filter((k) => k !== 'ahorro');
  const saveMore = /ahorr|guardar/.test(n) && /mas|más|subir|mayor/.test(norm(message));
  const pct: Record<string, number> = { ...BASE };
  if (pri.length) {
    // las prioridades suben; el resto baja un poco
    const boost = pri.length === 1 ? 10 : 7;
    for (const k of pri) pct[k] += boost;
    const others = Object.keys(pct).filter((k) => !pri.includes(k) && k !== 'ahorro');
    const per = (boost * pri.length) / others.length;
    for (const k of others) pct[k] = Math.max(3, pct[k] - per);
  }
  if (saveMore) { pct.ahorro += 10; pct.otros = Math.max(0, pct.otros - 5); pct.comida -= 5; }
  const total = Object.values(pct).reduce((a, b) => a + b, 0);
  let items = Object.entries(pct).filter(([, p]) => p > 0).map(([category, p]) => ({ category, pct: Math.round((p / total) * 100), amount: 0 }));
  const diff = 100 - items.reduce((a, i) => a + i.pct, 0);
  items.sort((a, b) => b.pct - a.pct); items[0].pct += diff;
  items = items.map((i) => ({ ...i, amount: round2((weekly * i.pct) / 100) }));
  return items;
}

const labelOf = (c: string) => ({ comida: 'Comida', salidas: 'Salidas', transporte: 'Transporte', suscripciones: 'Suscrip.', ahorro: 'Ahorro', otros: 'Otros' } as Record<string, string>)[c] ?? c;

/** Topes del usuario; si aún no eligió ninguno, usa el plan por defecto (BASE) sobre su mesada. */
export function userCaps(db: DB, user: UserRow) {
  const rows = db.prepare('SELECT category, weekly_amount w FROM budgets WHERE user_id=?').all(user.id) as { category: string; w: number }[];
  if (rows.length) return new Map(rows.map((r) => [r.category, r.w]));
  const allowance = user.weekly_allowance ?? 60;
  return new Map(Object.entries(BASE).map(([c, p]) => [c, round2((allowance * p) / 100)]));
}

export function budgetRows(db: DB, user: UserRow) {
  const now = nowFor(user);
  const from7 = new Date(now.getTime() - 7 * DAY).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5)).toISOString(); // medianoche Lima
  const startOfToday = new Date(dayStart) > now ? new Date(new Date(dayStart).getTime() - DAY).toISOString() : dayStart;
  const caps = userCaps(db, user);
  const spent = new Map((db.prepare("SELECT category, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>? AND occurred_at<=? GROUP BY category").all(user.id, from7, now.toISOString()) as { category: string; s: number }[]).map((r) => [r.category, r.s]));
  const today = new Map((db.prepare("SELECT category, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<=? GROUP BY category").all(user.id, startOfToday, now.toISOString()) as { category: string; s: number }[]).map((r) => [r.category, r.s]));
  const ant = new Map((db.prepare("SELECT category, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND amount<=8 AND occurred_at>? AND occurred_at<=? GROUP BY category").all(user.id, from7, now.toISOString()) as { category: string; s: number }[]).map((r) => [r.category, r.s]));
  return CATEGORIES.filter((c) => c !== 'ahorro').map((c) => {
    const cap = caps.get(c) ?? null;
    const s = round2(spent.get(c) ?? 0);
    return {
      category: c, label: labelOf(c), weeklyCap: cap, spent: s, remaining: cap === null ? null : round2(cap - s),
      pct: cap ? Math.round((s / cap) * 100) : null, today: round2(today.get(c) ?? 0), hormiga: round2(ant.get(c) ?? 0),
      level: cap === null ? 'none' : s / cap >= 1 ? 'over' : s / cap >= 0.8 ? 'warn' : 'ok',
    };
  });
}

export function budgetRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  r.get('/budgets', auth, wrap((req, res) => {
    const u = req.user!;
    const sav = userCaps(db, u).get('ahorro') ?? null;
    res.json({ weeklyAllowance: u.weekly_allowance ?? 60, savingsGoal: sav, items: budgetRows(db, u) });
  }));

  r.put('/budgets', auth, wrap((req, res) => {
    const b = z.object({ category: cat, weeklyAmount: z.number().min(0).max(5000) }).parse(req.body);
    db.prepare(`INSERT INTO budgets (user_id,category,weekly_amount) VALUES (?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET weekly_amount=excluded.weekly_amount`).run(req.user!.id, b.category, b.weeklyAmount);
    res.json({ items: budgetRows(db, req.user!) });
  }));

  /** Asistente: propone cómo repartir la mesada. Reglas simples (no requiere IA); es el punto donde se puede enchufar Claude. */
  r.post('/assistant/plan', auth, wrap((req, res) => {
    const b = z.object({ message: z.string().max(500).default(''), weeklyAmount: z.number().positive().max(5000).optional() }).parse(req.body ?? {});
    const u = req.user!;
    const m = b.message.match(/S\/\s*(\d+(?:[.,]\d+)?)/i)?.[1];
    const weekly = b.weeklyAmount ?? (m ? Number(m.replace(',', '.')) : u.weekly_allowance ?? 60);
    const items = buildPlan(weekly, b.message);
    const top = items.slice(0, 2).map((i) => `${labelOf(i.category)} ${i.pct}%`).join(' y ');
    res.json({
      weekly, items: items.map((i) => ({ ...i, label: labelOf(i.category) })),
      reply: `Listo. Con S/ ${weekly} por semana y priorizando lo que me contaste, te propongo esto:`,
      footnote: `${top} lideran el plan. Si quieres, sube el ahorro.`,
    });
  }));

  r.post('/assistant/apply', auth, wrap((req, res) => {
    const b = z.object({ weekly: z.number().positive().optional(), items: z.array(z.object({ category: cat, amount: z.number().min(0) })).min(1) }).parse(req.body);
    const u = req.user!;
    const up = db.prepare(`INSERT INTO budgets (user_id,category,weekly_amount) VALUES (?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET weekly_amount=excluded.weekly_amount`);
    db.transaction(() => {
      for (const i of b.items) up.run(u.id, i.category, i.amount);
      if (b.weekly) db.prepare('UPDATE users SET weekly_allowance=? WHERE id=?').run(b.weekly, u.id);
    })();
    const u2 = db.prepare('SELECT * FROM users WHERE id=?').get(u.id) as UserRow;
    res.json({ items: budgetRows(db, u2) });
  }));

  r.get('/levels', auth, wrap((req, res) => res.json(computeLevels(db, req.user!))));

  return r;
}
