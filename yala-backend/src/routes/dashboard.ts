import { Router } from 'express';
import type { DB } from '../db';
import { nowFor, requireAuth } from '../auth';
import { DAY, monthKey, monthRange, prevMonthKey, round2, wrap } from '../util';
import { categoryTotals, listMovements, toMovementDto } from '../services/movements';
import { adviceForToday } from '../services/advice';
import { computeProfile } from '../services/profile';
import { userCaps } from './budgets';
import { computeLevels, weeklyStats } from '../services/levels';

export function dashboardRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  r.get('/dashboard', auth, wrap(async (req, res) => {
    const u = req.user!;
    const now = nowFor(u);
    const key = monthKey(now);
    const byCategory = categoryTotals(db, u.id, key);
    const prev = categoryTotals(db, u.id, prevMonthKey(key));
    const sum = (o: Record<string, number>) => round2(Object.values(o).reduce((a, b) => a + b, 0));
    const { from, to } = monthRange(key);
    const income = (db.prepare("SELECT COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='income' AND occurred_at>=? AND occurred_at<?").get(u.id, from, to) as { s: number }).s;

    const from7 = new Date(now.getTime() - 7 * DAY).toISOString();
    const weekSpent = (db.prepare("SELECT COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<=?").get(u.id, from7, now.toISOString()) as { s: number }).s;
    const weekAllowance = u.weekly_allowance ?? 60;

    // Gastos hormiga: gastos chicos (<= S/ 8) del mes
    const ant = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='expense' AND amount<=8 AND occurred_at>=? AND occurred_at<?").get(u.id, from, to) as { n: number; s: number };
    const antTop = db.prepare("SELECT counterparty c, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND amount<=8 AND occurred_at>=? AND occurred_at<? GROUP BY counterparty ORDER BY s DESC LIMIT 1").get(u.id, from, to) as { c: string | null; s: number } | undefined;

    // Social
    const open = db.prepare("SELECT * FROM outings WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(u.id) as any;
    let openOuting = null;
    if (open) {
      const spent = (db.prepare('SELECT COALESCE(SUM(m.amount),0) s FROM outing_movements om JOIN movements m ON m.id=om.movement_id WHERE om.outing_id=?').get(open.id) as { s: number }).s;
      openOuting = { id: open.id, name: open.name, budget: open.budget, spent: round2(spent), remaining: round2(open.budget - spent) };
    }
    const pend = (dir: string) => db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM loans WHERE user_id=? AND direction=? AND paid_at IS NULL').get(u.id, dir) as { n: number; s: number };
    const next = db.prepare('SELECT id, friend_nickname f, amount, direction, due_date d FROM loans WHERE user_id=? AND paid_at IS NULL ORDER BY due_date LIMIT 1').get(u.id) as any;

    const p = computeProfile(db, u);
    const lv = computeLevels(db, u);
    const weekly = weeklyStats(db, u, 8);
    const savingsGoal = userCaps(db, u).get('ahorro') ?? round2(weekAllowance * 0.1);
    const daily: number[] = [];
    for (let d = 6; d >= 0; d--) {
      const a = new Date(now.getTime() - (d + 1) * DAY).toISOString(); const b2 = new Date(now.getTime() - d * DAY).toISOString();
      daily.push(round2((db.prepare("SELECT COALESCE(SUM(amount),0) s FROM movements WHERE user_id=? AND type='expense' AND amount<=8 AND occurred_at>? AND occurred_at<=?").get(u.id, a, b2) as { s: number }).s));
    }
    const hormigaWeek = { daily, total: round2(daily.reduce((x, y) => x + y, 0)) };
    res.json({
      month: key,
      totals: { expenses: sum(byCategory), income: round2(income), prevExpenses: sum(prev) },
      byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount, prevAmount: prev[category] ?? 0 })).sort((a, b) => b.amount - a.amount),
      week: { spent: round2(weekSpent), allowance: weekAllowance, pct: Math.round((weekSpent / weekAllowance) * 100) },
      hormiga: { count: ant.n, total: round2(ant.s), topCounterparty: antTop?.c ?? null, weekTotal: hormigaWeek.total, daily: hormigaWeek.daily },
      savings: { goal: savingsGoal, weeks: weekly.slice(0, 7).reverse().map((w) => w.saved), thisWeek: weekly[0].saved },
      level: { name: lv.level.name, number: lv.levelNumber, streakWeeks: lv.streakWeeks, weeksToGoat: lv.weeksToGoat, goatWeeks: lv.goatWeeks },
      social: {
        openOuting,
        owedToMe: { count: pend('lent').n, total: round2(pend('lent').s) },
        iOwe: { count: pend('borrowed').n, total: round2(pend('borrowed').s) },
        nextDue: next ? { loanId: next.id, friend: next.f, amount: next.amount, direction: next.direction, dueDate: next.d } : null,
      },
      recent: listMovements(db, u.id, { limit: 8 }).map(toMovementDto),
      advice: await adviceForToday(db, u),
      profile: { score: p.score, level: p.level, provisional: p.provisional, monthsOfHistory: p.monthsOfHistory },
    });
  }));

  r.get('/advice/today', auth, wrap(async (req, res) => {
    res.json(await adviceForToday(db, req.user!, req.query.refresh === 'true'));
  }));

  /** Resumen de la semana: qué gastaste, dónde te pasaste, sugerencias para la próxima. */
  r.get('/weekly-summary', auth, wrap((req, res) => {
    const u = req.user!;
    const now = nowFor(u);
    const allowance = u.weekly_allowance ?? 60;

    // Semana pasada (w=1) y actual (w=0)
    const from1 = new Date(now.getTime() - 14 * DAY).toISOString();
    const to1   = new Date(now.getTime() -  7 * DAY).toISOString();
    const from0 = to1;
    const to0   = now.toISOString();

    const spentByCategory = (from: string, to: string) =>
      (db.prepare("SELECT category, SUM(amount) s FROM movements WHERE user_id=? AND type='expense' AND occurred_at>=? AND occurred_at<=? GROUP BY category")
        .all(u.id, from, to) as { category: string; s: number }[]).map((r) => ({ category: r.category, spent: round2(r.s) }));

    const caps = db.prepare('SELECT category, weekly_amount FROM budgets WHERE user_id=?').all(u.id) as { category: string; weekly_amount: number }[];
    const capMap = new Map(caps.map((c) => [c.category, c.weekly_amount]));

    const lastWeek = spentByCategory(from1, to1);
    const thisWeek = spentByCategory(from0, to0);
    const totalLast = round2(lastWeek.reduce((a, b) => a + b.spent, 0));
    const totalThis = round2(thisWeek.reduce((a, b) => a + b.spent, 0));

    // Categorías donde se pasó del tope la semana pasada
    const overBudget = lastWeek
      .filter((c) => { const cap = capMap.get(c.category); return cap !== undefined && c.spent > cap; })
      .map((c) => ({ category: c.category, spent: c.spent, cap: capMap.get(c.category)!, over: round2(c.spent - capMap.get(c.category)!) }))
      .sort((a, b) => b.over - a.over);

    // Categoría con más gasto
    const topSpend = [...lastWeek].sort((a, b) => b.spent - a.spent)[0] ?? null;

    // Generación de sugerencias
    const suggestions: string[] = [];
    if (overBudget.length > 0) {
      const top = overBudget[0];
      suggestions.push(`En ${top.category} te pasaste S/ ${top.over} de tu tope. Para la próxima semana podrías reducir un poco ahí.`);
    }
    if (totalLast > allowance) {
      suggestions.push(`Esta semana gastaste S/ ${round2(totalLast - allowance)} más de tu mesada. Intenta cerrar la próxima dentro de S/ ${allowance}.`);
    } else if (totalLast <= allowance * 0.85) {
      suggestions.push(`¡Muy bien! La semana pasada te quedaste dentro del presupuesto y te sobró S/ ${round2(allowance - totalLast)}.`);
    }
    if (topSpend && topSpend.spent > allowance * 0.4) {
      suggestions.push(`${topSpend.category} fue tu mayor gasto (S/ ${topSpend.spent}). ¿Vale lo que gastaste ahí?`);
    }

    // ¿Sumó a la racha?
    const stats = weeklyStats(db, u, 3);
    const lastWithin = stats[1]?.within ?? false; // semana pasada

    res.json({
      allowance,
      lastWeek: {
        total: totalLast,
        within: totalLast <= allowance,
        withinBudget: lastWithin,
        byCategory: lastWeek.sort((a, b) => b.spent - a.spent),
      },
      thisWeek: {
        total: totalThis,
        byCategory: thisWeek.sort((a, b) => b.spent - a.spent),
      },
      overBudget,
      suggestions,
      streakEffect: lastWithin ? '+1 semana a tu racha 🔥' : null,
    });
  }));

  return r;
}
