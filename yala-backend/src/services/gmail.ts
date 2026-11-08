/**
 * Lectura de Gmail (solo lectura, solo correos del remitente de Yape).
 * Usa OAuth2 por HTTP directo (sin SDK). NO se guarda el cuerpo del correo: solo monto, fecha, destinatario y tipo.
 */
import type { DB } from '../db';
import type { UserRow } from '../auth';
import { config } from '../config';
import { decrypt, encrypt } from '../util';
import { addMovement } from './movements';
import { aiExtractYape } from './ai';
import { parseYapeWithFallback, stripHtml } from './yapeParser';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const googleConfigured = () => !!(config.google.clientId && config.google.clientSecret);

export function buildAuthUrl(redirectUri: string, scope: string, state: string, offline: boolean) {
  const p = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    ...(offline ? { access_type: 'offline', prompt: 'consent' } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string };
}

async function accessTokenFor(db: DB, userId: number): Promise<string> {
  const row = db.prepare('SELECT refresh_token_enc FROM gmail_tokens WHERE user_id=?').get(userId) as { refresh_token_enc: string } | undefined;
  if (!row) throw Object.assign(new Error('Gmail no conectado'), { code: 'not_connected' });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: decrypt(row.refresh_token_enc),
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw Object.assign(new Error('El permiso de Gmail venció o fue revocado. Vuelve a conectar.'), { code: 'token_revoked' });
  return ((await res.json()) as { access_token: string }).access_token;
}

export function saveRefreshToken(db: DB, userId: number, refreshToken: string) {
  db.prepare(
    `INSERT INTO gmail_tokens (user_id, refresh_token_enc) VALUES (?,?)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc=excluded.refresh_token_enc, connected_at=datetime('now')`,
  ).run(userId, encrypt(refreshToken));
}

interface GPart { mimeType?: string; body?: { data?: string }; parts?: GPart[] }
function bodyText(p: GPart | undefined): string {
  if (!p) return '';
  const dec = (d?: string) => (d ? Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '');
  if (p.mimeType === 'text/plain' && p.body?.data) return dec(p.body.data);
  if (p.parts) {
    const plain = p.parts.map(bodyText).join('\n').trim();
    if (plain) return plain;
  }
  if (p.mimeType === 'text/html' && p.body?.data) return stripHtml(dec(p.body.data));
  return '';
}

export interface SyncResult { found: number; imported: number; duplicates: number; unparsed: number }

export async function syncGmail(db: DB, user: UserRow, sinceDays = 90): Promise<SyncResult> {
  const at = await accessTokenFor(db, user.id);
  const headers = { authorization: `Bearer ${at}` };
  const senders = config.yapeSenders.map((s) => `from:${s}`).join(' OR ');
  const q = encodeURIComponent(`(${senders}) newer_than:${sinceDays}d`);
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=200`, { headers });
  if (!list.ok) throw Object.assign(new Error(`Gmail ${list.status}`), { code: 'gmail_error' });
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
  const out: SyncResult = { found: ids.length, imported: 0, duplicates: 0, unparsed: 0 };

  for (const { id } of ids) {
    const seen = db.prepare('SELECT 1 FROM movements WHERE user_id=? AND email_id=?').get(user.id, id);
    if (seen) { out.duplicates++; continue; }
    const prevFail = db.prepare('SELECT 1 FROM unparsed_emails WHERE user_id=? AND email_id=?').get(user.id, id);
    if (prevFail) { out.unparsed++; continue; }
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers });
    if (!r.ok) continue;
    const msg = (await r.json()) as { payload?: GPart; internalDate?: string };
    const text = bodyText(msg.payload);
    const fallback = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date();
    const { parsed } = await parseYapeWithFallback(text, aiExtractYape, fallback);
    // El cuerpo (`text`) se descarta aquí: nunca se guarda.
    if (!parsed) {
      db.prepare('INSERT OR IGNORE INTO unparsed_emails (user_id, email_id, reason) VALUES (?,?,?)').run(user.id, id, 'formato_no_reconocido');
      out.unparsed++;
      continue;
    }
    await addMovement(db, user, {
      occurredAt: parsed.occurredAt, amount: parsed.amount, type: parsed.type,
      counterparty: parsed.counterparty, origin: 'gmail', verified: true, emailId: id,
    });
    out.imported++;
  }
  db.prepare(`UPDATE gmail_tokens SET last_sync_at=datetime('now') WHERE user_id=?`).run(user.id);
  return out;
}
