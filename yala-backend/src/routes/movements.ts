import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth, signState, verifyState } from '../auth';
import { CATEGORIES, config } from '../config';
import { HttpError, wrap } from '../util';
import { addMovement, correctCategory, listMovements, monthContext, toMovementDto, type MovementRow } from '../services/movements';
import { aiExtractYape, classifyAndOpine } from '../services/ai';
import { parseYapeWithFallback, splitPasted } from '../services/yapeParser';
import { GMAIL_SCOPE, buildAuthUrl, exchangeCode, googleConfigured, saveRefreshToken, syncGmail } from '../services/gmail';
import { monthKey } from '../util';

const cat = z.enum(CATEGORIES);

export function movementRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  // ---------- Movimientos ----------
  r.get('/movements', auth, wrap((req, res) => {
    const q = z.object({
      from: z.string().optional(), to: z.string().optional(), category: cat.optional(),
      type: z.enum(['expense', 'income']).optional(),
      limit: z.coerce.number().int().positive().max(500).optional(), offset: z.coerce.number().int().min(0).optional(),
    }).parse(req.query);
    res.json({ items: listMovements(db, req.user!.id, q).map(toMovementDto) });
  }));

  r.post('/movements', auth, wrap(async (req, res) => {
    const b = z.object({
      amount: z.number().positive().max(100000), type: z.enum(['expense', 'income']).default('expense'),
      counterparty: z.string().max(80).nullish(), category: cat.optional(), occurredAt: z.string().datetime().optional(),
    }).parse(req.body);
    const u = req.user!;
    const { row } = await addMovement(db, u, {
      occurredAt: b.occurredAt ?? nowFor(u).toISOString(), amount: b.amount, type: b.type,
      counterparty: b.counterparty ?? null, category: b.category, origin: 'manual',
    });
    res.status(201).json(toMovementDto(row));
  }));

  /** El usuario pega el texto de uno o varios correos/notificaciones de Yape. */
  r.post('/movements/paste', auth, wrap(async (req, res) => {
    const { text } = z.object({ text: z.string().min(5).max(60000) }).parse(req.body);
    const u = req.user!;
    const out = { imported: 0, duplicates: 0, unparsed: 0, items: [] as ReturnType<typeof toMovementDto>[], allowanceUpdated: false, newAllowance: null as number | null };
    for (const chunk of splitPasted(text)) {
      const { parsed } = await parseYapeWithFallback(chunk, aiExtractYape, nowFor(u));
      if (!parsed) { out.unparsed++; continue; }
      const dup = db.prepare('SELECT 1 FROM movements WHERE user_id=? AND occurred_at=? AND amount=? AND type=? AND COALESCE(counterparty,\'\')=COALESCE(?,\'\')')
        .get(u.id, parsed.occurredAt, parsed.amount, parsed.type, parsed.counterparty);
      if (dup) { out.duplicates++; continue; }
      const { row } = await addMovement(db, u, { ...parsed, origin: 'pegado', verified: false });
      out.imported++;
      out.items.push(toMovementDto(row));

      // Si es un ingreso (yapeo recibido), ofrecer sumarlo a la mesada semanal
      if (parsed.type === 'income') {
        const currentAllowance = u.weekly_allowance ?? 0;
        const newAllowance = currentAllowance + parsed.amount;
        // Solo actualiza si la mesada no estaba configurada, o si la diferencia es significativa
        if (!u.weekly_allowance || parsed.amount >= 20) {
          db.prepare('UPDATE users SET weekly_allowance=? WHERE id=?').run(newAllowance, u.id);
          // Refresca el usuario en memoria para el resto del loop
          (u as any).weekly_allowance = newAllowance;
          out.allowanceUpdated = true;
          out.newAllowance = newAllowance;
        }
      }
    }
    res.json(out);
  }));

  r.patch('/movements/:id/category', auth, wrap((req, res) => {
    const b = z.object({ category: cat, applyToSame: z.boolean().optional() }).parse(req.body);
    const row = correctCategory(db, req.user!.id, Number(req.params.id), b.category, b.applyToSame ?? true);
    if (!row) throw new HttpError(404, 'Movimiento no encontrado');
    res.json(toMovementDto(row));
  }));

  /** Vuelve a pedir la opinión de la IA para un movimiento. */
  r.post('/movements/:id/opinion', auth, wrap(async (req, res) => {
    const u = req.user!;
    const m = db.prepare('SELECT * FROM movements WHERE id=? AND user_id=?').get(Number(req.params.id), u.id) as MovementRow | undefined;
    if (!m) throw new HttpError(404, 'Movimiento no encontrado');
    const c = await classifyAndOpine({ amount: m.amount, type: m.type, counterparty: m.counterparty }, monthContext(db, u.id, monthKey(new Date(m.occurred_at))), m.category as (typeof CATEGORIES)[number]);
    db.prepare('UPDATE movements SET ai_opinion=? WHERE id=?').run(c.opinion, m.id);
    res.json(toMovementDto({ ...m, ai_opinion: c.opinion }));
  }));

  r.delete('/movements/:id', auth, wrap((req, res) => {
    const i = db.prepare('DELETE FROM movements WHERE id=? AND user_id=?').run(Number(req.params.id), req.user!.id);
    if (!i.changes) throw new HttpError(404, 'Movimiento no encontrado');
    res.status(204).end();
  }));
  // ---------- Gmail (solo lectura) ----------
  r.get('/gmail/status', auth, wrap((req, res) => {
    const t = db.prepare('SELECT connected_at, last_sync_at FROM gmail_tokens WHERE user_id=?').get(req.user!.id) as { connected_at: string; last_sync_at: string | null } | undefined;
    const unparsed = (db.prepare('SELECT COUNT(*) c FROM unparsed_emails WHERE user_id=?').get(req.user!.id) as { c: number }).c;
    res.json({ configured: googleConfigured(), connected: !!t, connectedAt: t?.connected_at ?? null, lastSyncAt: t?.last_sync_at ?? null, unparsedEmails: unparsed, senderFilter: config.yapeSenders.join(', ') });
  }));

  r.get('/gmail/connect-url', auth, wrap((req, res) => {
    if (!googleConfigured()) throw new HttpError(501, 'Gmail no está configurado en el servidor. Usa el modo demo o pegado.', 'google_not_configured');
    res.json({ url: buildAuthUrl(config.google.gmailRedirect, GMAIL_SCOPE, signState({ k: 'gmail', uid: req.user!.id }), true) });
  }));

  r.get('/gmail/callback', wrap(async (req, res) => {
    const q = z.object({ code: z.string().optional(), state: z.string(), error: z.string().optional() }).parse(req.query);
    const back = new URL(config.frontendUrls[0]);
    back.pathname = '/conectar';
    const st = verifyState<{ k: string; uid: number }>(q.state);
    if (q.error || !q.code || st.k !== 'gmail') { back.searchParams.set('gmail', 'denied'); return res.redirect(back.toString()); }
    const t = await exchangeCode(q.code, config.google.gmailRedirect);
    if (!t.refresh_token) { back.searchParams.set('gmail', 'no_refresh'); return res.redirect(back.toString()); }
    saveRefreshToken(db, st.uid, t.refresh_token);
    db.prepare("INSERT INTO consents (user_id, kind, granted, text_version) VALUES (?, 'gmail_read', 1, 'v1')").run(st.uid);
    db.prepare("UPDATE users SET data_mode='gmail' WHERE id=?").run(st.uid);
    back.pathname = '/conectar';
    back.searchParams.set('gmail', 'connected');
    res.redirect(back.toString());
  }));

  r.post('/gmail/sync', auth, wrap(async (req, res) => {
    try {
      res.json(await syncGmail(db, req.user!));
    } catch (e: any) {
      if (e?.code === 'not_connected') throw new HttpError(409, e.message, 'not_connected');
      if (e?.code === 'token_revoked') throw new HttpError(401, e.message, 'token_revoked');
      throw e;
    }
  }));

  r.delete('/gmail', auth, wrap((req, res) => {
    db.prepare('DELETE FROM gmail_tokens WHERE user_id=?').run(req.user!.id);
    db.prepare("INSERT INTO consents (user_id, kind, granted, text_version) VALUES (?, 'gmail_read', 0, 'v1')").run(req.user!.id);
    res.status(204).end();
  }));

  return r;
}
