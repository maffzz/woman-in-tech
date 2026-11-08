import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth } from '../auth';
import { config } from '../config';
import { DAY, HttpError, ageOn, isoDate, token, wrap } from '../util';
import { computeProfile, saveSnapshot } from '../services/profile';
import { seedDemoStart, simulateThreeMonths } from '../services/demoSeed';
import { userDto } from './auth';

const DISCLAIMER = 'Perfil de hábitos generado por Yala. No es un historial crediticio formal ni una calificación de riesgo; es información voluntaria compartida por la persona.';

export function profileRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  r.get('/profile', auth, wrap((req, res) => {
    const u = req.user!;
    const p = computeProfile(db, u);
    const today = isoDate(nowFor(u));
    const has = db.prepare('SELECT 1 FROM profile_history WHERE user_id=? AND substr(computed_at,1,10)=?').get(u.id, today);
    if (!has) saveSnapshot(db, u, p);
    res.json({ ...p, disclaimer: DISCLAIMER });
  }));

  r.get('/profile/history', auth, wrap((req, res) => {
    const rows = db.prepare('SELECT computed_at, score, level, weeks_of_data FROM profile_history WHERE user_id=? ORDER BY computed_at').all(req.user!.id) as any[];
    res.json({ items: rows.map((x) => ({ computedAt: x.computed_at, score: x.score, level: x.level, weeksOfData: x.weeks_of_data })) });
  }));

  // ---------- Demo ----------
  const demoOnly = (u: { is_demo: number }) => { if (!u.is_demo) throw new HttpError(403, 'Solo disponible para la cuenta demo', 'demo_only'); };

  r.post('/demo/reset', auth, wrap((req, res) => {
    demoOnly(req.user!);
    seedDemoStart(db, req.user!);
    db.prepare('DELETE FROM certificates WHERE user_id=?').run(req.user!.id);
    res.json({ profile: computeProfile(db, req.user!) });
  }));

  /** "Simular 3 meses": adelanta el reloj y muestra el antes y después del perfil. */
  r.post('/demo/simulate-months', auth, wrap((req, res) => {
    const u = req.user!; demoOnly(u);
    const before = computeProfile(db, u);
    saveSnapshot(db, u, before);
    simulateThreeMonths(db, u);
    const u2 = db.prepare('SELECT * FROM users WHERE id=?').get(u.id) as typeof u;
    const after = computeProfile(db, u2);
    saveSnapshot(db, u2, after);
    res.json({ before, after, user: userDto(u2) });
  }));

  // ---------- Certificado para el banco ----------
  const certDto = (c: any) => ({ code: c.code, createdAt: c.created_at, expiresAt: c.expires_at, revoked: !!c.revoked, isDemo: !!c.is_demo, payload: JSON.parse(c.payload_json) });

  r.post('/certificates', auth, wrap((req, res) => {
    const u = req.user!; const now = nowFor(u);
    const b = z.object({ consent: z.literal(true) }).safeParse(req.body);
    if (!b.success) throw new HttpError(400, 'Se necesita tu consentimiento explícito para compartir el perfil', 'consent_required');
    const age = ageOn(u.birth_date, now);
    const demoBypass = !!(u.is_demo && config.allowDemoCert);
    if ((age === null || age < 18) && !demoBypass)
      throw new HttpError(403, 'El perfil solo puede compartirse con un banco al cumplir 18 años', 'underage');
    const p = computeProfile(db, u);
    const payload = {
      holderFirstName: u.name.split(' ')[0],
      level: p.level, score: p.score, provisional: p.provisional, monthsOfHistory: p.monthsOfHistory,
      indicators: p.indicators.map((i) => ({ key: i.key, label: i.label, score: i.score })),
      scoringVersion: p.version, generatedAt: now.toISOString(),
      demo: demoBypass && (age === null || age < 18),
      disclaimer: DISCLAIMER,
    };
    const code = `YALA-${token(4).toUpperCase()}`;
    db.prepare('INSERT INTO certificates (user_id, code, payload_json, is_demo, expires_at) VALUES (?,?,?,?,?)')
      .run(u.id, code, JSON.stringify(payload), payload.demo ? 1 : 0, new Date(now.getTime() + 30 * DAY).toISOString());
    db.prepare("INSERT INTO consents (user_id, kind, granted, text_version) VALUES (?, 'share_profile', 1, 'v1')").run(u.id);
    res.status(201).json({ ...certDto(db.prepare('SELECT * FROM certificates WHERE code=?').get(code)), shareUrl: `${config.frontendUrls[0].replace(/\/$/, '')}/banco/${code}` });
  }));

  r.get('/certificates', auth, wrap((req, res) => {
    const rows = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM certificate_views v WHERE v.certificate_id=c.id) views FROM certificates c WHERE user_id=? ORDER BY id DESC').all(req.user!.id) as any[];
    res.json({ items: rows.map((c) => ({ ...certDto(c), views: c.views })) });
  }));

  r.delete('/certificates/:code', auth, wrap((req, res) => {
    const i = db.prepare('UPDATE certificates SET revoked=1 WHERE code=? AND user_id=?').run(req.params.code, req.user!.id);
    if (!i.changes) throw new HttpError(404, 'Certificado no encontrado');
    db.prepare("INSERT INTO consents (user_id, kind, granted, text_version) VALUES (?, 'share_profile', 0, 'v1')").run(req.user!.id);
    res.status(204).end();
  }));

  /** Vista pública (sin login) para el banco: solo nivel, meses e indicadores. Nada de movimientos ni amigos. */
  r.get('/public/certificates/:code', wrap((req, res) => {
    const c = db.prepare('SELECT * FROM certificates WHERE code=?').get(req.params.code) as any;
    if (!c) throw new HttpError(404, 'Código no válido');
    const expired = new Date(c.expires_at).getTime() < Date.now() + (db.prepare('SELECT demo_offset_days d FROM users WHERE id=?').get(c.user_id) as { d: number }).d * DAY;
    if (c.revoked || expired) throw new HttpError(410, c.revoked ? 'La persona retiró este certificado' : 'Este certificado venció', c.revoked ? 'revoked' : 'expired');
    db.prepare('INSERT INTO certificate_views (certificate_id) VALUES (?)').run(c.id);
    res.json(certDto(c));
  }));

  // ---------- Privacidad ----------
  r.get('/privacy/consents', auth, wrap((req, res) => {
    res.json({ items: db.prepare('SELECT kind, granted, text_version textVersion, created_at createdAt FROM consents WHERE user_id=? ORDER BY id').all(req.user!.id) });
  }));
  r.post('/privacy/consents', auth, wrap((req, res) => {
    const b = z.object({ kind: z.enum(['terms', 'gmail_read', 'share_profile']), granted: z.boolean() }).parse(req.body);
    db.prepare('INSERT INTO consents (user_id, kind, granted, text_version) VALUES (?,?,?,?)').run(req.user!.id, b.kind, b.granted ? 1 : 0, 'v1');
    res.status(201).json({ ok: true });
  }));

  r.get('/privacy/export', auth, wrap((req, res) => {
    const id = req.user!.id;
    const all = (t: string) => db.prepare(`SELECT * FROM ${t} WHERE user_id=?`).all(id);
    res.setHeader('content-disposition', 'attachment; filename="yala-mis-datos.json"');
    res.json({
      user: userDto(req.user!), movements: all('movements'), loans: all('loans').map((l: any) => ({ ...l, token: undefined })),
      outings: all('outings'), advices: all('advices'), profileHistory: all('profile_history'), consents: all('consents'), certificates: all('certificates'),
    });
  }));

  /** Borra todo: cuenta, movimientos, tokens de Gmail, certificados. */
  r.delete('/privacy/data', auth, wrap((req, res) => {
    z.object({ confirm: z.literal('ELIMINAR') }).parse(req.body);
    db.prepare('DELETE FROM users WHERE id=?').run(req.user!.id); // cascada
    res.status(204).end();
  }));

  r.get('/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));
  return r;
}
