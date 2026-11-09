import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  weekly_allowance REAL,
  data_mode TEXT NOT NULL DEFAULT 'demo',      -- demo | gmail | pegado
  is_demo INTEGER NOT NULL DEFAULT 0,
  demo_offset_days INTEGER NOT NULL DEFAULT 0, -- reloj simulado para "Simular 3 meses"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,                   -- ISO
  amount REAL NOT NULL,                        -- siempre positivo
  type TEXT NOT NULL CHECK (type IN ('expense','income')),
  counterparty TEXT,                           -- destinatario o remitente
  category TEXT NOT NULL DEFAULT 'otros',
  ai_opinion TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',       -- demo | gmail | pegado | manual
  verified INTEGER NOT NULL DEFAULT 0,         -- 1 si viene de un correo real de Yape
  email_id TEXT,                               -- id del correo (para evitar duplicados)
  category_corrected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_movements_email ON movements(user_id, email_id) WHERE email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_movements_user_date ON movements(user_id, occurred_at);

CREATE TABLE IF NOT EXISTS category_rules (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty TEXT NOT NULL,
  category TEXT NOT NULL,
  PRIMARY KEY (user_id, counterparty)
);
CREATE TABLE IF NOT EXISTS outings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  budget REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',         -- open | finished
  final_spent REAL,
  within_budget INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outing_movements (
  outing_id INTEGER NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
  movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  PRIMARY KEY (outing_id, movement_id)
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_nickname TEXT NOT NULL,               -- solo apodo (los amigos son menores)
  amount REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('lent','borrowed')), -- lent: me deben | borrowed: debo
  concept TEXT,
  created_at TEXT NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  paid_method TEXT,                            -- yape | cash
  on_time INTEGER,
  confirmed_by_friend INTEGER NOT NULL DEFAULT 0,
  reminded_at TEXT,
  movement_id INTEGER REFERENCES movements(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  outing_id INTEGER REFERENCES outings(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_loans_user ON loans(user_id);
CREATE TABLE IF NOT EXISTS budgets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  weekly_amount REAL NOT NULL,
  PRIMARY KEY (user_id, category)
);
CREATE TABLE IF NOT EXISTS advices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'cache',
  UNIQUE (user_id, day)
);
CREATE TABLE IF NOT EXISTS profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_at TEXT NOT NULL,
  version TEXT NOT NULL,
  score REAL,
  level TEXT NOT NULL,
  indicators_json TEXT NOT NULL,
  weeks_of_data INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- gmail_read | share_profile | terms
  granted INTEGER NOT NULL,
  text_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at TEXT
);
CREATE TABLE IF NOT EXISTS unparsed_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE (user_id, email_id)
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  payload_json TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS certificate_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_categories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,          -- slug normalizado, ej: "merch_enhypen"
  label TEXT NOT NULL,        -- nombre visible, ej: "Merch Enhypen"
  emoji TEXT NOT NULL DEFAULT '🏷️',
  hidden INTEGER NOT NULL DEFAULT 0,  -- 1 = oculta (equivale a eliminar pero conserva historial)
  sort_order INTEGER NOT NULL DEFAULT 99,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,            -- apodo que le pone este usuario a su amigo
  token TEXT UNIQUE NOT NULL,        -- link de invitación
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, friend_user_id)
);
CREATE INDEX IF NOT EXISTS ix_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS ix_friendships_token ON friendships(token);
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,              -- S/ 0.10, 0.20, 0.50
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDb(file = config.dbPath): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
