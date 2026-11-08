import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { requireAuth, signState, signToken, verifyState, type UserRow } from '../auth';
import { config } from '../config';
import { HttpError, ageOn, wrap } from '../util';
import { buildAuthUrl, exchangeCode, googleConfigured } from '../services/gmail';
import { seedDemoStart } from '../services/demoSeed';

export const userDto = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  birthDate: u.birth_date,
  age: ageOn(u.birth_date),
  weeklyAllowance: u.weekly_allowance,
  dataMode: u.data_mode,
  isDemo: !!u.is_demo,
});

export function authRoutes(db: DB) {
  const r = Router();

  /** Entra como Diana (demo). Crea el usuario y siembra sus datos si no existe. */
  r.post('/auth/demo', wrap((req, res) => {
    if (!config.allowDemo) throw new HttpError(403, 'El modo demo está desactivado');
    const reseed = req.query.reset === 'true';
    let u = db.prepare("SELECT * FROM users WHERE email='diana.demo@yala.app'").get() as UserRow | undefined;
    if (!u) {
      db.prepare(`INSERT INTO users (email, name, birth_date, weekly_allowance, data_mode, is_demo) VALUES ('diana.demo@yala.app','Diana Zuñiga','2010-03-14',60,'demo',1)`).run();
      u = db.prepare("SELECT * FROM users WHERE email='diana.demo@yala.app'").get() as UserRow;
      seedDemoStart(db, u);
    } else if (reseed) {
      seedDemoStart(db, u);
    }
    res.json({ token: signToken(u.id), user: userDto(u) });
  }));

  /** Login sin Google, solo para desarrollo (ALLOW_DEV_LOGIN=true). */
  r.post('/auth/dev-login', wrap((req, res) => {
    if (!config.allowDevLogin) throw new HttpError(403, 'dev-login desactivado');
    const b = z.object({ email: z.string().email(), name: z.string().min(1), birthDate: z.string().optional(), weeklyAllowance: z.number().optional() }).parse(req.body);
    let u = db.prepare('SELECT * FROM users WHERE email=?').get(b.email) as UserRow | undefined;
    if (!u) {
      db.prepare('INSERT INTO users (email, name, birth_date, weekly_allowance, data_mode) VALUES (?,?,?,?,?)')
        .run(b.email, b.name, b.birthDate ?? null, b.weeklyAllowance ?? null, 'pegado');
      u = db.prepare('SELECT * FROM users WHERE email=?').get(b.email) as UserRow;
    }
    res.json({ token: signToken(u.id), user: userDto(u) });
  }));

  // ---- Login con Google (identidad: openid email profile) ----
  r.get('/auth/google/url', wrap((_req, res) => {
    if (!googleConfigured()) throw new HttpError(501, 'Google no está configurado (GOOGLE_CLIENT_ID/SECRET)', 'google_not_configured');
    const url = buildAuthUrl(config.google.loginRedirect, 'openid email profile', signState({ k: 'login' }), false);
    res.json({ url });
  }));

  r.get('/auth/google/callback', wrap(async (req, res) => {
    const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    verifyState(state);
    const t = await exchangeCode(code, config.google.loginRedirect);
    const claims = JSON.parse(Buffer.from((t.id_token ?? '').split('.')[1] ?? '', 'base64url').toString() || '{}') as { email?: string; name?: string };
    if (!claims.email) throw new HttpError(400, 'Google no devolvió el correo');
    let u = db.prepare('SELECT * FROM users WHERE email=?').get(claims.email) as UserRow | undefined;
    if (!u) {
      db.prepare('INSERT INTO users (email, name, data_mode) VALUES (?,?,?)').run(claims.email, claims.name ?? claims.email.split('@')[0], 'pegado');
      u = db.prepare('SELECT * FROM users WHERE email=?').get(claims.email) as UserRow;
    }
    const url = new URL(config.frontendUrls[0]);
    url.searchParams.set('token', signToken(u.id));
    res.redirect(url.toString());
  }));

  const auth = requireAuth(db);

  r.get('/me', auth, (req, res) => res.json(userDto(req.user!)));

  r.patch('/me', auth, wrap((req, res) => {
    const b = z.object({
      name: z.string().min(1).optional(),
      birthDate: z.string().optional(),
      weeklyAllowance: z.number().positive().optional(),
      dataMode: z.enum(['demo', 'gmail', 'pegado']).optional(),
    }).parse(req.body);
    const u = req.user!;
    db.prepare('UPDATE users SET name=?, birth_date=?, weekly_allowance=?, data_mode=? WHERE id=?').run(
      b.name ?? u.name, b.birthDate ?? u.birth_date, b.weeklyAllowance ?? u.weekly_allowance, b.dataMode ?? u.data_mode, u.id,
    );
    res.json(userDto(db.prepare('SELECT * FROM users WHERE id=?').get(u.id) as UserRow));
  }));

  return r;
}
