/**
 * Rutas del sistema social de amigos:
 * - Invitar amigo por link
 * - Ver actividad / nivel de amigos
 * - "Migajeando": si un amigo está en números rojos, mandarle una donación simbólica
 */
import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { nowFor, requireAuth, type UserRow } from '../auth';
import { HttpError, token, wrap } from '../util';
import { computeLevels } from '../services/levels';
import { budgetRows } from './budgets';

export function friendRoutes(db: DB) {
  const r = Router();
  const auth = requireAuth(db);

  // ── Generar link de invitación ──────────────────────────────────────────────
  r.post('/friends/invite', auth, wrap((req, res) => {
    const u = req.user!;
    const t = token(6);
    const link = `${process.env.FRONTEND_URL?.split(',')[0]?.trim() ?? 'http://localhost:5173'}/amigos/unirse/${t}`;
    // Guarda el token para que cuando el amigo abra el link se pueda conectar
    db.prepare(`INSERT INTO friendships (user_id, friend_user_id, nickname, token, accepted)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT DO NOTHING`).run(u.id, u.id, 'pending', t); // friend_user_id temporal = self, se actualiza al aceptar
    res.json({ link, token: t });
  }));

  // ── Aceptar invitación (el amigo abre el link y hace login) ────────────────
  r.post('/friends/join/:token', auth, wrap((req, res) => {
    const u = req.user!;
    const inv = db.prepare('SELECT * FROM friendships WHERE token=? AND accepted=0').get(req.params.token) as any;
    if (!inv) throw new HttpError(404, 'Link de invitación no válido o ya usado', 'invalid_invite');
    if (inv.user_id === u.id) throw new HttpError(400, 'No puedes agregarte a ti mismo', 'self_invite');
    // Conectar en ambas direcciones
    db.prepare(`INSERT OR IGNORE INTO friendships (user_id, friend_user_id, nickname, token, accepted)
      VALUES (?, ?, ?, ?, 1)`).run(inv.user_id, u.id, u.name.split(' ')[0], token(4));
    db.prepare(`INSERT OR IGNORE INTO friendships (user_id, friend_user_id, nickname, token, accepted)
      VALUES (?, ?, ?, ?, 1)`).run(u.id, inv.user_id,
        (db.prepare('SELECT name FROM users WHERE id=?').get(inv.user_id) as { name: string }).name.split(' ')[0],
        token(4));
    // Marcar la invitación como usada
    db.prepare('UPDATE friendships SET accepted=1, friend_user_id=? WHERE token=?').run(u.id, req.params.token);
    res.json({ ok: true, message: '¡Ya son panas en Yala! 🎉' });
  }));

  // ── Lista de amigos + su actividad ─────────────────────────────────────────
  r.get('/friends', auth, wrap((req, res) => {
    const u = req.user!;
    const rows = db.prepare(`
      SELECT f.id, f.nickname, f.friend_user_id fid, u.name friend_name
      FROM friendships f JOIN users u ON u.id = f.friend_user_id
      WHERE f.user_id = ? AND f.accepted = 1 AND f.friend_user_id != ?
    `).all(u.id, u.id) as { id: number; nickname: string; fid: number; friend_name: string }[];

    const items = rows.map((row) => {
      const friend = db.prepare('SELECT * FROM users WHERE id=?').get(row.fid) as UserRow | undefined;
      if (!friend) return null;

      // Nivel del amigo
      const levels = computeLevels(db, friend);

      // ¿Está "migajeando"? = se pasó del presupuesto en alguna categoría esta semana
      const brows = budgetRows(db, friend);
      const overBudget = brows.filter((b) => b.level === 'over');
      const isMigajeando = overBudget.length > 0;
      const migajeandoIn = overBudget.map((b) => b.label).join(', ');

      // Cuánto gastó esta semana vs su mesada (sin exponer detalles)
      const weekPct = Math.round(
        (brows.reduce((a, b) => a + b.spent, 0) / Math.max(1, friend.weekly_allowance ?? 60)) * 100
      );

      return {
        friendshipId: row.id,
        nickname: row.nickname,
        levelName: levels.level.name,
        levelNumber: levels.levelNumber,
        levelKey: levels.level.key,
        streakWeeks: levels.streakWeeks,
        isMigajeando,
        migajeandoIn: isMigajeando ? migajeandoIn : null,
        weekPct: Math.min(weekPct, 150), // cap en 150% para no exponer montos exactos
      };
    }).filter(Boolean);

    res.json({ items });
  }));

  // ── Donar migajas (centavos simbólicos de apoyo) ───────────────────────────
  r.post('/friends/:friendshipId/donate', auth, wrap((req, res) => {
    const b = z.object({
      amount: z.number().refine((n) => [0.1, 0.2, 0.5, 1].includes(n), 'Solo S/ 0.10, 0.20, 0.50 o S/ 1.00'),
      message: z.string().max(80).optional(),
    }).parse(req.body);
    const u = req.user!;
    const f = db.prepare(`
      SELECT friend_user_id FROM friendships WHERE id=? AND user_id=? AND accepted=1
    `).get(Number(req.params.friendshipId), u.id) as { friend_user_id: number } | undefined;
    if (!f) throw new HttpError(404, 'Amistad no encontrada');

    db.prepare('INSERT INTO donations (from_user_id, to_user_id, amount, message) VALUES (?,?,?,?)')
      .run(u.id, f.friend_user_id, b.amount, b.message ?? null);

    const donorName = u.name.split(' ')[0];
    res.status(201).json({
      ok: true,
      message: `Mandaste S/ ${b.amount} de apoyo simbólico. ¡${donorName} siempre atento a sus panas!`,
    });
  }));

  // ── Demo: simula actividad de amigos (solo cuenta demo) ────────────────────
  r.get('/friends/demo-activity', auth, wrap((req, res) => {
    // Amigos ficticios con estado simulado para la demo
    res.json({
      items: [
        {
          friendshipId: 1001, nickname: 'Sofi',
          levelName: 'Colibrí', levelNumber: 2, levelKey: 'colibri',
          streakWeeks: 2, isMigajeando: false, migajeandoIn: null, weekPct: 65,
        },
        {
          friendshipId: 1002, nickname: 'Mateo',
          levelName: 'Pollito', levelNumber: 1, levelKey: 'pollito',
          streakWeeks: 0, isMigajeando: true, migajeandoIn: 'Juegos, Salidas', weekPct: 118,
        },
        {
          friendshipId: 1003, nickname: 'Lucía',
          levelName: 'Conejo', levelNumber: 3, levelKey: 'conejo',
          streakWeeks: 5, isMigajeando: false, migajeandoIn: null, weekPct: 72,
        },
      ],
    });
  }));

  return r;
}
