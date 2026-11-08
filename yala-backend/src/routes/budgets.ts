import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth, type UserRow } from '../auth';
import { CATEGORIES } from '../config';
import { DAY, HttpError, norm, round2, wrap } from '../util';
import { computeLevels } from '../services/levels';

const cat = z.enum(CATEGORIES);

/** Categorías predeterminadas del sistema */
const DEFAULT_CATEGORIES = [
  { key: 'comida',         label: 'Comida',          emoji: '🍔', sort_order: 1 },
  { key: 'transporte',     label: 'Transporte',       emoji: '🚌', sort_order: 2 },
  { key: 'salidas',        label: 'Salidas',          emoji: '🎉', sort_order: 3 },
  { key: 'juegos',         label: 'Juegos',           emoji: '🎮', sort_order: 4 },
  { key: 'recargas',       label: 'Recargas',         emoji: '📱', sort_order: 5 },
  { key: 'suscripciones',  label: 'Suscripciones',    emoji: '🎵', sort_order: 6 },
  { key: 'entretenimiento',label: 'Entretenimiento',  emoji: '🎬', sort_order: 7 },
  { key: 'ahorro',         label: 'Ahorro',           emoji: '🐖', sort_order: 8 },
  { key: 'otros',          label: 'Otros',            emoji: '🏷️', sort_order: 99 },
] as const;

/**
 * Devuelve las categorías activas del usuario: primero las del sistema (que no estén ocultas),
 * luego las personalizadas que haya creado.
 */
export function getUserCategories(db: DB, userId: number) {
  const hidden = new Set(
    (db.prepare('SELECT key FROM user_categories WHERE user_id=? AND hidden=1').all(userId) as { key: string }[]).map((r) => r.key)
  );
  const custom = db.prepare('SELECT key, label, emoji, sort_order FROM user_categories WHERE user_id=? AND hidden=0').all(userId) as { key: string; label: string; emoji: string; sort_order: number }[];
  const customKeys = new Set(custom.map((c) => c.key));

  const system = DEFAULT_CATEGORIES
    .filter((c) => !hidden.has(c.key) && !customKeys.has(c.key))
    .map((c) => ({ ...c, isSystem: true, hidden: false }));

  const userDefined = custom
    .filter((c) => !DEFAULT_CATEGORIES.some((d) => d.key === c.key)) // solo las truly custom
    .map((c) => ({ ...c, isSystem: false, hidden: false }));

  return [...system, ...userDefined].sort((a, b) => a.sort_order - b.sort_order);
}

/** Reparto por defecto (porcentajes) cuando el usuario no pide nada especial. */
const BASE: Record<string, number> = { comida: 35, salidas: 25, transporte: 15, suscripciones: 10, ahorro: 10, otros: 5 };

const KEY: [string, RegExp][] = [
  ['comida', /comer|comida|almuerzo|menu|snack|kiosco/], ['salidas', /salir|salidas|amig|fiesta|cine|pana/],
  ['transporte', /transporte|taxi|combi|bus|pasaje|movilidad/], ['suscripciones', /suscrip|netflix|spotify|streaming/],
  ['ahorro', /ahorr|guardar|meta/],
];

export function buildPlan(weekly: number, message: string, mode: 'weekly' | 'outing' = 'weekly') {
  const n = norm(message);
  const pri = KEY.filter(([, re]) => re.test(n)).map(([k]) => k).filter((k) => k !== 'ahorro');
  const saveMore = /ahorr|guardar/.test(n) && /mas|más|subir|mayor/.test(norm(message));

  if (mode === 'outing') {
    // Para una salida: divide el monto en gastos concretos de esa salida.
    // Nunca incluye "salidas" como categoría (ya estás en una salida).
    // Detecta lo que menciona: comida, compras, transporte, entretenimiento.
    const outingBase: Record<string, number> = { comida: 40, transporte: 20, entretenimiento: 25, otros: 15 };

    // Si menciona comprar/joyería/ropa/merch → sube "otros"
    if (/comprar|joyeria|ropa|merch|tienda|mall|compras/i.test(message)) {
      outingBase.otros += 15; outingBase.comida -= 10; outingBase.transporte -= 5;
    }
    // Si menciona fotos/cine/karaoke/juegos → sube entretenimiento
    if (/foto|cine|karaoke|juego|bowling|concierto/i.test(message)) {
      outingBase.entretenimiento += 10; outingBase.comida -= 10;
    }
    // Prioridades explícitas del mensaje
    for (const k of pri) {
      if (k !== 'salidas' && outingBase[k] !== undefined) outingBase[k] += 10;
    }

    // Normalizar a 100%
    const total = Object.values(outingBase).reduce((a, b) => a + b, 0);
    let items = Object.entries(outingBase)
      .filter(([, p]) => p > 0)
      .map(([category, p]) => ({
        category,
        pct: Math.round((p / total) * 100),
        amount: round2((weekly * p) / total),
      }))
      .sort((a, b) => b.pct - a.pct);
    const diff = 100 - items.reduce((a, i) => a + i.pct, 0);
    if (items.length) items[0].pct += diff;
    return items;
  }

  const pct: Record<string, number> = { ...BASE };
  if (pri.length) {
    const boost = pri.length === 1 ? 10 : 7;
    for (const k of pri) pct[k] = (pct[k] ?? 5) + boost;
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

const labelOf = (c: string, isOuting = false) => {
  if (isOuting) {
    const outingLabels: Record<string, string> = {
      comida: 'Comer', transporte: 'Pasajes', entretenimiento: 'Entret.', otros: 'Compras / otros',
      recargas: 'Recarga', juegos: 'Juegos',
    };
    if (outingLabels[c]) return outingLabels[c];
  }
  return ({ comida: 'Comida', salidas: 'Salidas', transporte: 'Transporte', suscripciones: 'Suscrip.', ahorro: 'Ahorro', otros: 'Otros', juegos: 'Juegos', recargas: 'Recargas', entretenimiento: 'Entret.' } as Record<string, string>)[c] ?? c;
};

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
    const b = z.object({
      message: z.string().max(500).default(''),
      weeklyAmount: z.number().positive().max(5000).optional(),
      forceOuting: z.boolean().optional(),
    }).parse(req.body ?? {});
    const u = req.user!;
    const n = norm(b.message);
    // Monto: "S/ X", "tengo X soles", "X soles para", "con X soles", "con X"
    const mS     = b.message.match(/S\/\s*(\d+(?:[.,]\d+)?)/i)?.[1];
    const mTengo = b.message.match(/tengo\s+(\d+(?:[.,]\d+)?)\s*soles?/i)?.[1];
    const mPara  = b.message.match(/(\d+(?:[.,]\d+)?)\s*soles?\s+para/i)?.[1];
    const mCon   = b.message.match(/(?:^|\s)con\s+(\d+(?:[.,]\d+)?)\s*soles?/i)?.[1];
    const mSolo  = b.message.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*soles?/i)?.[1];
    const weekly = b.weeklyAmount ?? (
      mS     ? Number(mS.replace(',', '.'))     :
      mTengo ? Number(mTengo.replace(',', '.')) :
      mPara  ? Number(mPara.replace(',', '.'))  :
      mCon   ? Number(mCon.replace(',', '.'))   :
      mSolo  ? Number(mSolo.replace(',', '.'))  :
      u.weekly_allowance ?? 60
    );

    // Detectar salida específica (evento puntual), con posibilidad de forzar desde el cliente
    const isOuting = b.forceOuting ?? /salir con|voy a salir|quiero salir|salida (del|con|de)|plan del .*(sabado|domingo|finde|fin de semana|noche|hoy)|presupuesto para (la salida|el plan|el finde|hoy|esta noche)|para (el sabado|el domingo|el finde|hoy|esta noche|la salida|el plan)|tengo .* soles? (para|y tenemos|y queremos)/i.test(b.message);

    const items = buildPlan(weekly, b.message, isOuting ? 'outing' : 'weekly');
    const top = items.slice(0, 2).map((i) => `${labelOf(i.category)} ${i.pct}%`).join(' y ');

    const reply = isOuting
      ? `Listo. Con S/ ${weekly} para esa salida, te propongo dividirlo así:`
      : `Listo. Con S/ ${weekly} por semana y priorizando lo que me contaste, te propongo esto:`;
    const footnote = isOuting
      ? `${top} llevan la mayor parte. Si te sobra algo, guárdalo.`
      : `${top} lideran el plan. Si quieres, sube el ahorro.`;

    res.json({
      weekly, isOuting,
      items: items.map((i) => ({ ...i, label: labelOf(i.category, isOuting) })),
      reply, footnote,
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

  // ---------- Categorías personalizadas ----------
  r.get('/categories', auth, wrap((req, res) => {
    res.json({ items: getUserCategories(db, req.user!.id) });
  }));

  r.post('/categories', auth, wrap((req, res) => {
    const b = z.object({
      label: z.string().min(1).max(40),
      emoji: z.string().max(4).default('🏷️'),
    }).parse(req.body);
    const key = norm(b.label).replace(/\s+/g, '_').slice(0, 30);
    if (!key) throw new HttpError(400, 'Nombre inválido', 'invalid_key');
    const existing = db.prepare('SELECT hidden FROM user_categories WHERE user_id=? AND key=?').get(req.user!.id, key) as { hidden: number } | undefined;
    if (existing && !existing.hidden) throw new HttpError(409, 'Ya tienes una categoría con ese nombre', 'duplicate');
    // Si estaba oculta (borrada), la reactiva
    if (existing) {
      db.prepare('UPDATE user_categories SET hidden=0, label=?, emoji=? WHERE user_id=? AND key=?').run(b.label, b.emoji, req.user!.id, key);
    } else {
      const maxOrder = (db.prepare('SELECT MAX(sort_order) m FROM user_categories WHERE user_id=?').get(req.user!.id) as { m: number | null }).m ?? 10;
      db.prepare('INSERT INTO user_categories (user_id, key, label, emoji, sort_order) VALUES (?,?,?,?,?)').run(req.user!.id, key, b.label, b.emoji, maxOrder + 1);
    }
    res.status(201).json({ items: getUserCategories(db, req.user!.id) });
  }));

  r.delete('/categories/:key', auth, wrap((req, res) => {
    const keyStr = String(req.params.key);
    // Para las del sistema: crear entrada oculta
    const systemKeys = DEFAULT_CATEGORIES.map((c) => c.key) as string[];
    if (systemKeys.includes(keyStr)) {
      db.prepare('INSERT INTO user_categories (user_id, key, label, emoji, hidden) VALUES (?,?,?,?,1) ON CONFLICT(user_id, key) DO UPDATE SET hidden=1').run(req.user!.id, keyStr, keyStr, '🏷️');
    } else {
      db.prepare('UPDATE user_categories SET hidden=1 WHERE user_id=? AND key=?').run(req.user!.id, keyStr);
    }
    res.json({ items: getUserCategories(db, req.user!.id) });
  }));

  r.get('/levels', auth, wrap((req, res) => res.json(computeLevels(db, req.user!))));

  return r;
}
