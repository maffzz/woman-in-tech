import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth, type UserRow } from '../auth';
import { config } from '../config';
import { DAY, HttpError, norm, round2, token, wrap } from '../util';
import { toMovementDto, type MovementRow } from '../services/movements';

interface LoanRow {
  id: number; user_id: number; friend_nickname: string; amount: number; direction: 'lent' | 'borrowed'; concept: string | null;
  created_at: string; due_date: string; paid_at: string | null; paid_method: string | null; on_time: number | null;
  confirmed_by_friend: number; reminded_at: string | null; movement_id: number | null; token: string; outing_id: number | null;
}

const loanLink = (t: string) => `${config.frontendUrls[0].replace(/\/$/, '')}/p/${t}`;

/** Mensajes de cobro — 3 niveles: 0=sin cariño, 1=con cariño, 2=mucho cariño */
export function reminderMessage(
  l: Pick<LoanRow, 'friend_nickname' | 'amount' | 'concept' | 'due_date'>,
  now: Date,
  carinioLevel: 0 | 1 | 2 = 1,
) {
  const late = new Date(l.due_date).getTime() < now.getTime();
  const what = l.concept ? ` de ${l.concept}` : '';
  const S = `S/ ${l.amount}`;

  if (carinioLevel === 0) {
    // Sin cariño — directo y al punto
    return late
      ? `${l.friend_nickname}, ya venció el plazo. Me debes ${S}${what}. Págame hoy.`
      : `${l.friend_nickname}, te debo recordar los ${S}${what}. Para el ${new Date(l.due_date).toISOString().slice(0, 10)}.`;
  }
  if (carinioLevel === 2) {
    // Mucho cariño — super suave, casi da vergüenza cobrar
    return late
      ? `Heyyy ${l.friend_nickname} 🥺💕 sé que estás ocupado/a pero si puedes, cuando puedas, los ${S}${what}… sin presión, te quiero igual bb 🫶`
      : `${l.friend_nickname} bby 🌸 solo un recordatorio chiquitito de los ${S}${what} para el ${new Date(l.due_date).toISOString().slice(0, 10)}. No hay drama ily 💜`;
  }
  // Con cariño (nivel 1) — el tono original
  return late
    ? `Hola ${l.friend_nickname} 🙌 ¿Me ayudas con los ${S}${what} cuando puedas? Un Yape y listo. ¡Gracias!`
    : `Hola ${l.friend_nickname} 😊 Te recuerdo los ${S}${what}, para el ${new Date(l.due_date).toISOString().slice(0, 10)}. ¡Gracias!`;
}

export const loanDto = (l: LoanRow, now = new Date()) => ({
  id: l.id, friendNickname: l.friend_nickname, amount: l.amount, direction: l.direction, concept: l.concept,
  createdAt: l.created_at, dueDate: l.due_date, paidAt: l.paid_at, paidMethod: l.paid_method, onTime: l.on_time === null ? null : !!l.on_time,
  confirmedByFriend: !!l.confirmed_by_friend, remindedAt: l.reminded_at, movementId: l.movement_id, outingId: l.outing_id,
  status: l.paid_at ? 'paid' : new Date(l.due_date).getTime() < now.getTime() ? 'overdue' : 'pending',
  confirmLink: loanLink(l.token),
});

function getLoan(db: DB, u: UserRow, id: number) {
  const l = db.prepare('SELECT * FROM loans WHERE id=? AND user_id=?').get(id, u.id) as LoanRow | undefined;
  if (!l) throw new HttpError(404, 'Préstamo no encontrado');
  return l;
}

/** Reparto de una cuenta. Devuelve montos por persona (el usuario paga y le deben). */
export function splitBill(total: number, people: { nickname: string; amount?: number }[], mode: 'equal' | 'custom') {
  if (mode === 'equal') {
    const n = people.length + 1; // incluye a quien pagó
    const base = Math.floor((total / n) * 100) / 100;
    const shares = people.map((p) => ({ nickname: p.nickname, amount: base }));
    const myShare = round2(total - base * people.length); // el resto (centavos) queda con quien pagó
    return { shares, myShare };
  }
  const shares = people.map((p) => ({ nickname: p.nickname, amount: round2(p.amount ?? 0) }));
  const owed = round2(shares.reduce((a, s) => a + s.amount, 0));
  if (owed > total + 0.001) throw new HttpError(400, 'Los montos superan el total de la cuenta', 'split_exceeds_total');
  return { shares, myShare: round2(total - owed) };
}

export function socialRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  // ---------- Salidas ----------
  const outingDto = (o: any) => {
    const mv = db.prepare('SELECT m.* FROM outing_movements om JOIN movements m ON m.id=om.movement_id WHERE om.outing_id=? ORDER BY m.occurred_at').all(o.id) as MovementRow[];
    const spent = round2(mv.reduce((a, m) => a + m.amount, 0));
    return {
      id: o.id, name: o.name, startsAt: o.starts_at, endsAt: o.ends_at, budget: o.budget, status: o.status,
      spent: o.status === 'finished' ? o.final_spent : spent, remaining: round2(o.budget - spent),
      progressPct: Math.round((spent / o.budget) * 100), withinBudget: o.within_budget === null ? null : !!o.within_budget,
      movements: mv.map(toMovementDto),
    };
  };
  const getOuting = (u: UserRow, id: number) => {
    const o = db.prepare('SELECT * FROM outings WHERE id=? AND user_id=?').get(id, u.id);
    if (!o) throw new HttpError(404, 'Salida no encontrada');
    return o as any;
  };

  r.post('/outings', auth, wrap((req, res) => {
    const b = z.object({ name: z.string().min(1).max(60), budget: z.number().positive().max(5000), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() }).parse(req.body);
    const u = req.user!; const now = nowFor(u);
    const id = db.prepare('INSERT INTO outings (user_id,name,starts_at,ends_at,budget) VALUES (?,?,?,?,?)')
      .run(u.id, b.name, b.startsAt ?? now.toISOString(), b.endsAt ?? new Date(now.getTime() + DAY).toISOString(), b.budget).lastInsertRowid;
    res.status(201).json(outingDto(getOuting(u, Number(id))));
  }));
  r.get('/outings', auth, wrap((req, res) => {
    const rows = db.prepare('SELECT * FROM outings WHERE user_id=? ORDER BY starts_at DESC LIMIT 50').all(req.user!.id);
    res.json({ items: rows.map(outingDto) });
  }));
  r.get('/outings/:id', auth, wrap((req, res) => {
    const o = getOuting(req.user!, Number(req.params.id));
    const loans = db.prepare('SELECT * FROM loans WHERE outing_id=?').all(o.id) as LoanRow[];
    res.json({ ...outingDto(o), loans: loans.map((l) => loanDto(l, nowFor(req.user!))) });
  }));
  r.post('/outings/:id/movements', auth, wrap((req, res) => {
    const u = req.user!; const o = getOuting(u, Number(req.params.id));
    const { movementId } = z.object({ movementId: z.number().int() }).parse(req.body);
    if (!db.prepare("SELECT 1 FROM movements WHERE id=? AND user_id=? AND type='expense'").get(movementId, u.id)) throw new HttpError(404, 'Gasto no encontrado');
    db.prepare('INSERT OR IGNORE INTO outing_movements (outing_id, movement_id) VALUES (?,?)').run(o.id, movementId);
    db.prepare("UPDATE movements SET category='salidas', category_corrected=1 WHERE id=?").run(movementId);
    res.json(outingDto(o));
  }));
  r.delete('/outings/:id/movements/:mid', auth, wrap((req, res) => {
    const o = getOuting(req.user!, Number(req.params.id));
    db.prepare('DELETE FROM outing_movements WHERE outing_id=? AND movement_id=?').run(o.id, Number(req.params.mid));
    res.json(outingDto(o));
  }));
  r.post('/outings/:id/finish', auth, wrap((req, res) => {
    const o = getOuting(req.user!, Number(req.params.id));
    const spent = (db.prepare('SELECT COALESCE(SUM(m.amount),0) s FROM outing_movements om JOIN movements m ON m.id=om.movement_id WHERE om.outing_id=?').get(o.id) as { s: number }).s;
    db.prepare("UPDATE outings SET status='finished', final_spent=?, within_budget=?, ends_at=? WHERE id=?").run(round2(spent), spent <= o.budget ? 1 : 0, nowFor(req.user!).toISOString(), o.id);
    res.json(outingDto(getOuting(req.user!, o.id)));
  }));

  // ---------- Dividir cuenta ----------
  r.post('/split', auth, wrap((req, res) => {
    const b = z.object({
      total: z.number().positive().max(5000), mode: z.enum(['equal', 'custom']).default('equal'),
      people: z.array(z.object({ nickname: z.string().min(1).max(30), amount: z.number().positive().optional() })).min(1).max(15),
      concept: z.string().max(60).optional(), dueDays: z.number().int().min(1).max(60).default(5), outingId: z.number().int().optional(),
      createLoans: z.boolean().default(true),
    }).parse(req.body);
    const u = req.user!; const now = nowFor(u);
    if (b.mode === 'custom' && b.people.some((p) => p.amount === undefined)) throw new HttpError(400, 'Falta el monto de alguna persona', 'missing_amount');
    const { shares, myShare } = splitBill(b.total, b.people, b.mode);
    const due = new Date(now.getTime() + b.dueDays * DAY).toISOString();
    const ins = db.prepare('INSERT INTO loans (user_id,friend_nickname,amount,direction,concept,created_at,due_date,token,outing_id) VALUES (?,?,?,?,?,?,?,?,?)');
    const loans = shares.map((s) => {
      const t = token();
      const base = { friend_nickname: s.nickname, amount: s.amount, concept: b.concept ?? 'Cuenta compartida', due_date: due, token: t };
      let l: LoanRow | null = null;
      if (b.createLoans) {
        const id = ins.run(u.id, s.nickname, s.amount, 'lent', base.concept, now.toISOString(), due, t, b.outingId ?? null).lastInsertRowid;
        l = db.prepare('SELECT * FROM loans WHERE id=?').get(id) as LoanRow;
      }
      const link = loanLink(t);
      return {
        nickname: s.nickname, amount: s.amount, loan: l ? loanDto(l, now) : null,
        whatsappText: `Hola ${s.nickname} 😊 Tu parte de ${base.concept} es S/ ${s.amount}. Puedes yapearme cuando puedas. Confírmalo aquí: ${link}`,
      };
    });
    res.status(201).json({ total: b.total, myShare, shares: loans });
  }));

  // ---------- Préstamos ----------
  r.post('/loans', auth, wrap((req, res) => {
    const b = z.object({
      friendNickname: z.string().min(1).max(30), amount: z.number().positive().max(2000), direction: z.enum(['lent', 'borrowed']),
      concept: z.string().max(60).optional(), dueDate: z.string().datetime().optional(),
    }).parse(req.body);
    const u = req.user!; const now = nowFor(u);
    const id = db.prepare('INSERT INTO loans (user_id,friend_nickname,amount,direction,concept,created_at,due_date,token) VALUES (?,?,?,?,?,?,?,?)')
      .run(u.id, b.friendNickname, b.amount, b.direction, b.concept ?? null, now.toISOString(), b.dueDate ?? new Date(now.getTime() + 7 * DAY).toISOString(), token()).lastInsertRowid;
    res.status(201).json(loanDto(getLoan(db, u, Number(id)), now));
  }));

  r.get('/loans', auth, wrap((req, res) => {
    const u = req.user!; const now = nowFor(u);
    const st = z.enum(['pending', 'paid', 'all']).default('all').parse(req.query.status ?? 'all');
    const rows = db.prepare('SELECT * FROM loans WHERE user_id=? ORDER BY paid_at IS NOT NULL, due_date').all(u.id) as LoanRow[];
    const items = rows.map((l) => loanDto(l, now)).filter((l) => st === 'all' || (st === 'paid' ? l.status === 'paid' : l.status !== 'paid'));
    res.json({ items });
  }));

  /** Detecta pagos en Yape que parecen saldar un préstamo pendiente (apodo en el destinatario y mismo monto). */
  r.get('/loans/suggestions', auth, wrap((req, res) => {
    const u = req.user!;
    const loans = db.prepare('SELECT * FROM loans WHERE user_id=? AND paid_at IS NULL').all(u.id) as LoanRow[];
    const out: { loanId: number; movement: ReturnType<typeof toMovementDto>; reason: string }[] = [];
    for (const l of loans) {
      const type = l.direction === 'borrowed' ? 'expense' : 'income';
      const cands = db.prepare(`SELECT * FROM movements WHERE user_id=? AND type=? AND occurred_at>=? AND ABS(amount-?)<=0.5
        AND id NOT IN (SELECT movement_id FROM loans WHERE movement_id IS NOT NULL)`).all(u.id, type, l.created_at, l.amount) as MovementRow[];
      const m = cands.find((c) => c.counterparty && norm(c.counterparty).includes(norm(l.friend_nickname)));
      if (m) out.push({ loanId: l.id, movement: toMovementDto(m), reason: `Yape de S/ ${m.amount} ${type === 'expense' ? 'a' : 'de'} ${m.counterparty}` });
    }
    res.json({ items: out });
  }));

  r.patch('/loans/:id', auth, wrap((req, res) => {
    const u = req.user!; const l = getLoan(db, u, Number(req.params.id));
    const b = z.object({ dueDate: z.string().datetime().optional(), concept: z.string().max(60).optional(), amount: z.number().positive().optional() }).parse(req.body);
    db.prepare('UPDATE loans SET due_date=?, concept=?, amount=? WHERE id=?').run(b.dueDate ?? l.due_date, b.concept ?? l.concept, b.amount ?? l.amount, l.id);
    res.json(loanDto(getLoan(db, u, l.id), nowFor(u)));
  }));
  r.delete('/loans/:id', auth, wrap((req, res) => {
    getLoan(db, req.user!, Number(req.params.id));
    db.prepare('DELETE FROM loans WHERE id=?').run(Number(req.params.id));
    res.status(204).end();
  }));

  /** Mensaje amable para cobrar (o recordar). Marca el recordatorio: gestionar el cobro suma al perfil. */
  r.post('/loans/:id/remind', auth, wrap((req, res) => {
    const u = req.user!; const l = getLoan(db, u, Number(req.params.id)); const now = nowFor(u);
    if (l.direction !== 'lent') throw new HttpError(400, 'Solo puedes recordar préstamos que hiciste tú', 'not_lent');
    if (l.paid_at) throw new HttpError(409, 'Ya está pagado', 'already_paid');
    const { carinioLevel } = z.object({ carinioLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1) }).parse(req.body ?? {});
    db.prepare('UPDATE loans SET reminded_at=? WHERE id=?').run(now.toISOString(), l.id);
    res.json({ message: reminderMessage(l, now, carinioLevel), link: loanLink(l.token), loan: loanDto(getLoan(db, u, l.id), now) });
  }));

  /** Marca un préstamo como pagado. on_time = pagado antes o el mismo día del vencimiento. */
  r.post('/loans/:id/pay', auth, wrap((req, res) => {
    const u = req.user!; const l = getLoan(db, u, Number(req.params.id)); const now = nowFor(u);
    if (l.paid_at) throw new HttpError(409, 'Ya está pagado', 'already_paid');
    const b = z.object({ method: z.enum(['yape', 'cash']).default('yape'), movementId: z.number().int().optional() }).parse(req.body ?? {});
    const onTime = now.getTime() <= new Date(l.due_date).getTime() + DAY - 1;
    db.prepare('UPDATE loans SET paid_at=?, paid_method=?, on_time=?, movement_id=? WHERE id=?').run(now.toISOString(), b.method, onTime ? 1 : 0, b.movementId ?? null, l.id);
    res.json(loanDto(getLoan(db, u, l.id), now));
  }));

  /** Solo demo: simula que el amigo abrió el link y confirmó. */
  r.post('/loans/:id/simulate-confirm', auth, wrap((req, res) => {
    const u = req.user!;
    if (!u.is_demo) throw new HttpError(403, 'Solo disponible en demo');
    const l = getLoan(db, u, Number(req.params.id));
    db.prepare('UPDATE loans SET confirmed_by_friend=1 WHERE id=?').run(l.id);
    res.json(loanDto(getLoan(db, u, l.id), nowFor(u)));
  }));

  // ---------- Link público para el amigo (sin login, solo apodo) ----------
  r.get('/public/loans/:token', wrap((req, res) => {
    const l = db.prepare('SELECT l.*, u.name owner FROM loans l JOIN users u ON u.id=l.user_id WHERE l.token=?').get(req.params.token) as (LoanRow & { owner: string }) | undefined;
    if (!l) throw new HttpError(404, 'Link no válido');
    res.json({ ownerFirstName: l.owner.split(' ')[0], friendNickname: l.friend_nickname, amount: l.amount, concept: l.concept, dueDate: l.due_date, direction: l.direction, confirmed: !!l.confirmed_by_friend, paid: !!l.paid_at });
  }));
  r.post('/public/loans/:token/confirm', wrap((req, res) => {
    const l = db.prepare('SELECT id FROM loans WHERE token=?').get(req.params.token) as { id: number } | undefined;
    if (!l) throw new HttpError(404, 'Link no válido');
    db.prepare('UPDATE loans SET confirmed_by_friend=1 WHERE id=?').run(l.id);
    res.json({ confirmed: true });
  }));

  return r;
}
