import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import type { DB } from './db';
import { config } from './config';
import { HttpError } from './util';
import { authRoutes } from './routes/auth';
import { movementRoutes } from './routes/movements';
import { dashboardRoutes } from './routes/dashboard';
import { socialRoutes } from './routes/social';
import { profileRoutes } from './routes/profile';
import { budgetRoutes } from './routes/budgets';

export function createApp(db: DB) {
  const app = express();
  app.use(cors({ origin: config.frontendUrls.includes('*') ? true : config.frontendUrls, credentials: false }));
  app.use(express.json({ limit: '200kb' }));
  app.use('/api', authRoutes(db), movementRoutes(db), dashboardRoutes(db), socialRoutes(db), profileRoutes(db), budgetRoutes(db));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada', 'not_found')));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code ?? 'error' });
    if (err instanceof ZodError) return res.status(400).json({ error: 'Datos inválidos', code: 'validation', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') return res.status(401).json({ error: 'Sesión inválida', code: 'bad_token' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido', code: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'Error interno', code: 'internal' });
  });
  return app;
}
