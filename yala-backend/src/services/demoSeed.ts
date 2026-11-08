/**
 * Datos de demo de "Diana" (16 años, S/ 60 semanales por Yape).
 * Genera movimientos, salidas y préstamos relativos al "ahora" del usuario, de forma determinista.
 */
import type { DB } from '../db';
import { nowFor, type UserRow } from '../auth';
import { CATEGORIES, type Category } from '../config';
import { opinionTemplate } from './ai';
import { DAY, monthKey, round2, token } from '../util';
import { categoryTotals, monthContext } from './movements';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SNACK = ['Kiosco Doña Rosa', 'Bodega Los Andes', 'Panadería San José', 'Tambo'];
const TRANSPORT = ['Taxi Rápido', 'Combi Línea 12', 'Uber'];
const GAMES = ['Garena Free Fire', 'Google Play Games', 'Roblox'];
const OUTING_PLACES = ['Pizzería Don Mario', 'Cineplanet', 'Heladería Capri', 'Bembos'];

interface SeedOpts {
  weeks: number;
  qStart: number; // calidad de hábitos 0 (mala) .. 1 (excelente) al inicio
  qEnd: number;
  seed: number;
}

/** Genera `weeks` semanas que terminan en el "ahora" del usuario. */
export function seedWeeks(db: DB, user: UserRow, o: SeedOpts) {
  const now = nowFor(user).getTime();
  const base = now - o.weeks * 7 * DAY;
  const r = rng(o.seed);
  const between = (a: number, b: number) => a + (b - a) * r();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  const insM = db.prepare(
    `INSERT INTO movements (user_id, occurred_at, amount, type, counterparty, category, origin, verified)
     VALUES (?,?,?,?,?,?, 'demo', 1)`,
  );
  const mv = (t: number, amount: number, type: 'expense' | 'income', cp: string, cat: Category) =>
    Number(insM.run(user.id, new Date(t).toISOString(), round2(amount), type, cp, cat).lastInsertRowid);

  const insOuting = db.prepare(
    `INSERT INTO outings (user_id, name, starts_at, ends_at, budget, status, final_spent, within_budget) VALUES (?,?,?,?,?,'finished',?,?)`,
  );
  const insOM = db.prepare('INSERT INTO outing_movements (outing_id, movement_id) VALUES (?,?)');
  const insLoan = db.prepare(
    `INSERT INTO loans (user_id, friend_nickname, amount, direction, concept, created_at, due_date, paid_at, paid_method, on_time, confirmed_by_friend, reminded_at, token)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const friends = ['Mateo', 'Ana', 'Lucía', 'Sofi', 'Diego'];

  for (let w = 0; w < o.weeks; w++) {
    const q = o.qStart + (o.qEnd - o.qStart) * (o.weeks > 1 ? w / (o.weeks - 1) : 1);
    // f=1.0 cuando q=0 (gasta exacto), f=0.82 cuando q=1 (le sobra un poco). Rango más realista.
    const f = 1.0 - 0.18 * q;
    const t0 = base + w * 7 * DAY;

    // Mesada (lunes)
    mv(t0 + 13 * 3600_000, 60, 'income', 'Mamá (Rosa Z.)', 'otros');
    if (r() < 0.35) mv(t0 + 3 * DAY + 20 * 3600_000, 20, 'income', 'Abuela Julia', 'otros');

    // Gastos hormiga: snacks (2–3 por semana, S/ 2–4)
    const nSnacks = 2 + Math.floor(r() * 2);
    for (let i = 0; i < nSnacks; i++) mv(t0 + (1 + i) * DAY + between(14, 19) * 3600_000, between(2, 4), 'expense', pick(SNACK), 'comida');
    // Almuerzo escolar (lunes a viernes, S/ 5–8) — el gasto más recurrente de una adolescente
    const nAlmuerzos = 3 + Math.floor(r() * 3); // 3–5 días
    for (let i = 0; i < nAlmuerzos; i++) mv(t0 + (1 + i) * DAY + 13 * 3600_000, between(5, 8), 'expense', 'Menú escolar', 'comida');
    // Recarga (cada dos semanas aprox)
    if (r() < 0.55) mv(t0 + 2 * DAY + 15 * 3600_000, 5, 'expense', 'Claro Recarga', 'recargas');
    // Transporte (2 viajes, S/ 2–2.50)
    for (let i = 0; i < 2; i++) mv(t0 + (1 + i * 2) * DAY + 12 * 3600_000, between(2, 2.5), 'expense', pick(TRANSPORT), 'transporte');
    // Juegos: S/ 4–10 según calidad; spike puntual de S/ 20 solo 1 de cada 6 semanas con calidad baja
    const spike = q < 0.35 && w % 6 === 3 ? 20 : 0;
    mv(t0 + 4 * DAY + 21 * 3600_000, round2(4 + (1 - q) * 6 + spike), 'expense', pick(GAMES), 'juegos');

    // Salida del sábado (día 5), 15:00-22:00 Lima = 20:00-03:00 UTC
    const startT = t0 + 5 * DAY + 20 * 3600_000;
    const endT = t0 + 6 * DAY + 3 * 3600_000;
    const budget = 30;
    // Con q bajo puede pasarse un poco (hasta S/ 32); con q alto se queda en S/ 20–26
    const target = budget * (1.05 - 0.22 * q) * (0.85 + r() * 0.18);
    const parts = 2 + Math.floor(r() * 2);
    const ids: number[] = [];
    let spent = 0;
    for (let i = 0; i < parts; i++) {
      const amt = round2(target / parts);
      spent += amt;
      ids.push(mv(startT + (i + 1) * 2 * 3600_000, amt, 'expense', pick(OUTING_PLACES), 'salidas'));
    }
    spent = round2(spent);
    const oid = Number(
      insOuting.run(user.id, 'Salida con amigas', new Date(startT).toISOString(), new Date(endT).toISOString(), budget, spent, spent <= budget ? 1 : 0).lastInsertRowid,
    );
    ids.forEach((id) => insOM.run(oid, id));

    // Préstamos: Diana debe cada ~3 semanas; presta cada ~4 semanas
    if (w % 3 === 1) {
      const amt = pick([8, 10, 12]);
      const created = t0 + 2 * DAY;
      const due = created + 5 * DAY;
      const onTime = r() < 0.3 + 0.65 * q;
      const paid = onTime ? due - DAY : due + (1 + Math.floor(r() * 3)) * DAY;
      insLoan.run(user.id, pick(friends), amt, 'borrowed', 'Cine', new Date(created).toISOString(), new Date(due).toISOString(),
        new Date(paid).toISOString(), 'yape', onTime ? 1 : 0, 1, null, token());
    }
    if (w % 4 === 2) {
      const amt = pick([10, 15]);
      const created = t0 + 3 * DAY;
      const due = created + 5 * DAY;
      const reminded = r() < 0.4 + 0.5 * q;
      const paidLate = r() < 0.7;
      insLoan.run(user.id, pick(friends), amt, 'lent', 'Pizza', new Date(created).toISOString(), new Date(due).toISOString(),
        paidLate ? new Date(due + DAY).toISOString() : null, paidLate ? 'yape' : null, null, 1,
        reminded ? new Date(due + DAY / 2).toISOString() : null, token());
    }
  }
}

/** Reasigna opiniones (plantilla) a todos los movimientos de demo. */
function fillOpinions(db: DB, user: UserRow) {
  const months = db.prepare(`SELECT DISTINCT substr(occurred_at,1,7) m FROM movements WHERE user_id=?`).all(user.id) as { m: string }[];
  const upd = db.prepare('UPDATE movements SET ai_opinion=? WHERE id=?');
  for (const { m } of months) {
    const ctx = monthContext(db, user.id, m);
    const rows = db
      .prepare(`SELECT id, amount, category, type FROM movements WHERE user_id=? AND substr(occurred_at,1,7)=? AND ai_opinion IS NULL`)
      .all(user.id, m) as { id: number; amount: number; category: string; type: string }[];
    for (const row of rows) {
      const cat = ((CATEGORIES as readonly string[]).includes(row.category) ? row.category : 'otros') as Category;
      upd.run(row.type === 'income' ? `Ingreso de S/ ${row.amount} registrado.` : opinionTemplate(cat, row.amount, ctx), row.id);
    }
  }
}

/** Deja un par de préstamos pendientes para que la demo tenga recordatorios y "sugerencias de pago". */
function pendingLoans(db: DB, user: UserRow) {
  const now = nowFor(user).getTime();
  const ins = db.prepare(
    `INSERT INTO loans (user_id, friend_nickname, amount, direction, concept, created_at, due_date, token) VALUES (?,?,?,?,?,?,?,?)`,
  );
  ins.run(user.id, 'Ana', 15, 'borrowed', 'Entrada al cine', new Date(now - 3 * DAY).toISOString(), new Date(now + 2 * DAY).toISOString(), token());
  ins.run(user.id, 'Mateo', 10, 'lent', 'Pizza del sábado', new Date(now - 2 * DAY).toISOString(), new Date(now + 3 * DAY).toISOString(), token());
}

export function clearUserData(db: DB, userId: number) {
  for (const t of ['outing_movements']) void t;
  db.prepare('DELETE FROM outings WHERE user_id=?').run(userId); // cascada a outing_movements
  db.prepare('DELETE FROM loans WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM movements WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM advices WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM profile_history WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM category_rules WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM unparsed_emails WHERE user_id=?').run(userId);
  db.prepare('UPDATE users SET demo_offset_days=0 WHERE id=?').run(userId);
}

/** Estado inicial de la demo: ~5 semanas de hábitos mejorables (nivel Inicial/Pollo). */
export function seedDemoStart(db: DB, user: UserRow) {
  clearUserData(db, user.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.id) as UserRow;
  // qStart bajo = gasta más y de forma irregular → nivel bajo al inicio
  seedWeeks(db, u, { weeks: 5, qStart: 0.0, qEnd: 0.15, seed: 7 });
  pendingLoans(db, u);
  fillOpinions(db, u);
}

/** "Simular 3 meses": adelanta el reloj 13 semanas y agrega hábitos que mejoran. */
export function simulateThreeMonths(db: DB, user: UserRow) {
  db.prepare('UPDATE users SET demo_offset_days = demo_offset_days + 91 WHERE id=?').run(user.id);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.id) as UserRow;
  // los préstamos pendientes antiguos quedan como pagados a tiempo para no ensuciar el resultado
  db.prepare(`UPDATE loans SET paid_at=?, paid_method='yape', on_time=1, confirmed_by_friend=1 WHERE user_id=? AND paid_at IS NULL`)
    .run(new Date(nowFor(u).getTime() - 80 * DAY).toISOString(), u.id);
  seedWeeks(db, u, { weeks: 13, qStart: 0.3, qEnd: 0.72, seed: 21 });
  pendingLoans(db, u);
  fillOpinions(db, u);
  return categoryTotals(db, u.id, monthKey(nowFor(u)));
}
