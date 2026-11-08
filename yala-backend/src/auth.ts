import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config';
import type { DB } from './db';
import { HttpError, DAY } from './util';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  birth_date: string | null;
  weekly_allowance: number | null;
  data_mode: 'demo' | 'gmail' | 'pegado';
  is_demo: number;
  demo_offset_days: number;
  created_at: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow;
  }
}

export const signToken = (userId: number, expiresIn: jwt.SignOptions['expiresIn'] = '7d') =>
  jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn });

export const signState = (payload: object) => jwt.sign(payload, config.jwtSecret, { expiresIn: '10m' });
export const verifyState = <T>(s: string): T => jwt.verify(s, config.jwtSecret) as T;

export function requireAuth(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Falta el token de acceso', 'no_token'));
    try {
      const { sub } = jwt.verify(h.slice(7), config.jwtSecret) as unknown as { sub: number };
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(sub) as UserRow | undefined;
      if (!u) return next(new HttpError(401, 'Usuario no encontrado', 'no_user'));
      req.user = u;
      next();
    } catch {
      next(new HttpError(401, 'Token inválido o vencido', 'bad_token'));
    }
  };
}

/** "Ahora" del usuario: reloj real + desplazamiento del simulador de meses. */
export const nowFor = (u: Pick<UserRow, 'demo_offset_days'>) => new Date(Date.now() + u.demo_offset_days * DAY);
