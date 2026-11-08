import 'dotenv/config';

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : v === 'true');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendUrls: (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY ?? 'dev-encryption-key-change-me-0123456789',
  dbPath: process.env.DB_PATH ?? './data/yala.db',
  aiMode: (process.env.AI_MODE ?? 'auto') as 'auto' | 'real' | 'cache',
  allowDemo: bool(process.env.ALLOW_DEMO, true),
  allowDemoCert: bool(process.env.ALLOW_DEMO_CERT, true),
  allowDevLogin: bool(process.env.ALLOW_DEV_LOGIN, true),
  // IA: Claude (Anthropic)
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  claudeModel: process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5',
  // IA: Gemini (Google)
  aiProvider: (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'gemini',
  geminiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    loginRedirect: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/auth/google/callback',
    gmailRedirect: process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:4000/api/gmail/callback',
  },
  // YAPE_SENDER o BCP. Separados por coma para admitir varios remitentes.
  yapeSenders: (process.env.YAPE_SENDER ?? 'notificaciones@yape.com.pe,notificaciones@notificacionesbcp.com.pe')
    .split(',')
    .map((s) => s.trim().toLowerCase()),
  // Alias de compatibilidad (primer remitente)
  get yapeSender() { return this.yapeSenders[0]; },
};

export const CATEGORIES = [
  'comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros',
] as const;
export type Category = (typeof CATEGORIES)[number];
