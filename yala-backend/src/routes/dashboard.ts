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

  return r;
}
