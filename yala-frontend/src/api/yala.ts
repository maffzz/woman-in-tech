import { http } from './client';

export type Category = 'comida' | 'transporte' | 'juegos' | 'entretenimiento' | 'recargas' | 'salidas' | 'suscripciones' | 'ahorro' | 'otros';
export interface User { id: number; email: string; name: string; birthDate: string | null; age: number | null; weeklyAllowance: number | null; dataMode: 'demo' | 'gmail' | 'pegado'; isDemo: boolean }
export interface Movement { id: number; occurredAt: string; amount: number; type: 'expense' | 'income'; counterparty: string | null; category: Category; aiOpinion: string | null; origin: string; verified: boolean }
export interface Dashboard {
  month: string;
  totals: { expenses: number; income: number; prevExpenses: number };
  week: { spent: number; allowance: number; pct: number };
  hormiga: { count: number; total: number; topCounterparty: string | null; weekTotal: number; daily: number[] };
  savings: { goal: number; weeks: number[]; thisWeek: number };
  level: { name: string; number: number; streakWeeks: number; weeksToGoat: number; goatWeeks: number };
  social: { openOuting: { id: number; name: string; budget: number; spent: number; remaining: number } | null; owedToMe: { count: number; total: number }; iOwe: { count: number; total: number }; nextDue: { loanId: number; friend: string; amount: number; direction: string; dueDate: string } | null };
  recent: Movement[];
  advice: { day: string; text: string; source: string };
  profile: { score: number | null; level: string; provisional: boolean; monthsOfHistory: number };
}
export interface BudgetRow { category: Category; label: string; weeklyCap: number | null; spent: number; remaining: number | null; pct: number | null; today: number; hormiga: number; level: 'none' | 'ok' | 'warn' | 'over' }
export interface Budgets { weeklyAllowance: number; savingsGoal: number | null; items: BudgetRow[] }
export interface Plan { weekly: number; isOuting?: boolean; items: { category: Category; label: string; pct: number; amount: number }[]; reply: string; footnote: string }
export interface UserCategory { key: string; label: string; emoji: string; isSystem: boolean; hidden: boolean; sort_order: number }
export interface LevelItem { key: 'pollito' | 'colibri' | 'conejo' | 'oveja' | 'goat'; name: string; hint: string; minWeeks: number; status: 'done' | 'current' | 'locked' }
export interface Levels { streakWeeks: number; goatWeeks: number; weeksToGoat: number; savingsMet: boolean; level: LevelItem; levelNumber: number; levels: LevelItem[]; daysTo18: number | null; nextLevel: { name: string; weeksNeeded: number } | null }
export interface Loan { id: number; friendNickname: string; amount: number; direction: 'lent' | 'borrowed'; concept: string | null; dueDate: string; paidAt: string | null; onTime: boolean | null; confirmedByFriend: boolean; remindedAt: string | null; status: 'pending' | 'overdue' | 'paid'; confirmLink: string }
export interface Outing { id: number; name: string; budget: number; status: 'open' | 'finished'; spent: number; remaining: number; progressPct: number; withinBudget: boolean | null; movements: Movement[] }
export interface Indicator { key: string; label: string; score: number | null; detail?: string }
export interface Profile { score: number | null; level: 'Inicial' | 'Constante' | 'Confiable' | 'Sólido'; provisional: boolean; weeksOfData: number; monthsOfHistory: number; nextLevel: { level: string; pointsNeeded: number } | null; indicators: Indicator[]; tips: string[]; disclaimer: string }
export interface Certificate { code: string; createdAt: string; expiresAt: string; revoked: boolean; isDemo: boolean; views?: number; shareUrl?: string; payload: { holderFirstName: string; level: string; score: number | null; provisional: boolean; monthsOfHistory: number; indicators: { key: string; label: string; score: number | null }[]; generatedAt: string; demo: boolean; disclaimer: string } }
export interface GmailStatus { configured: boolean; connected: boolean; connectedAt: string | null; lastSyncAt: string | null; unparsedEmails: number; senderFilter: string }
export interface SplitResult { total: number; myShare: number; shares: { nickname: string; amount: number; loan: Loan | null; whatsappText: string }[] }
export interface FriendActivity {
  friendshipId: number;
  nickname: string;
  levelName: string;
  levelNumber: number;
  levelKey: string;
  streakWeeks: number;
  isMigajeando: boolean;
  migajeandoIn: string | null;
  weekPct: number;
}
export interface WeeklySummary {
  allowance: number;
  lastWeek: { total: number; within: boolean; withinBudget: boolean; byCategory: { category: string; spent: number }[] };
  thisWeek: { total: number; byCategory: { category: string; spent: number }[] };
  overBudget: { category: string; spent: number; cap: number; over: number }[];
  suggestions: string[];
  streakEffect: string | null;
}

export const api = {
  // auth
  demo: () => http<{ token: string; user: User }>('/auth/demo', { method: 'POST', body: {}, auth: false }),
  devLogin: (b: { email: string; name: string }) => http<{ token: string; user: User }>('/auth/dev-login', { body: b, auth: false }),
  googleUrl: () => http<{ url: string }>('/auth/google/url', { auth: false }),
  me: () => http<User>('/me'),
  patchMe: (b: Partial<{ name: string; birthDate: string; weeklyAllowance: number; dataMode: User['dataMode'] }>) => http<User>('/me', { method: 'PATCH', body: b }),
  // inicio
  dashboard: () => http<Dashboard>('/dashboard'),
  levels: () => http<Levels>('/levels'),
  weeklySummary: () => http<WeeklySummary>('/weekly-summary'),
  // movimientos
  movements: (q: Record<string, string | number> = {}) => http<{ items: Movement[] }>('/movements?' + new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))),
  addMovement: (b: { amount: number; counterparty?: string; category?: Category; type?: 'expense' | 'income' }) => http<Movement>('/movements', { body: b }),
  setCategory: (id: number, category: Category) => http<Movement>(`/movements/${id}/category`, { method: 'PATCH', body: { category } }),
  deleteMovement: (id: number) => http<void>(`/movements/${id}`, { method: 'DELETE' }),
  paste: (text: string) => http<{ imported: number; duplicates: number; unparsed: number; items: Movement[]; allowanceUpdated: boolean; newAllowance: number | null }>('/movements/paste', { body: { text } }),
  // topes y asistente
  budgets: () => http<Budgets>('/budgets'),
  setBudget: (category: Category, weeklyAmount: number) => http<{ items: BudgetRow[] }>('/budgets', { method: 'PUT', body: { category, weeklyAmount } }),
  plan: (message: string, forceOuting?: boolean) => http<Plan>('/assistant/plan', { body: { message, ...(forceOuting ? { forceOuting: true } : {}) } }),
  applyPlan: (p: Plan) => http<{ items: BudgetRow[] }>('/assistant/apply', { body: { weekly: p.weekly, items: p.items.map((i) => ({ category: i.category, amount: i.amount })) } }),
  // gmail
  gmailStatus: () => http<GmailStatus>('/gmail/status'),
  gmailConnectUrl: () => http<{ url: string }>('/gmail/connect-url'),
  gmailSync: () => http<{ found: number; imported: number; duplicates: number; unparsed: number }>('/gmail/sync', { method: 'POST', body: {} }),
  gmailDisconnect: () => http<void>('/gmail', { method: 'DELETE' }),
  // social
  outings: () => http<{ items: Outing[] }>('/outings'),
  createOuting: (b: { name: string; budget: number }) => http<Outing>('/outings', { body: b }),
  addToOuting: (id: number, movementId: number) => http<Outing>(`/outings/${id}/movements`, { body: { movementId } }),
  finishOuting: (id: number) => http<Outing>(`/outings/${id}/finish`, { method: 'POST', body: {} }),
  loans: () => http<{ items: Loan[] }>('/loans'),
  createLoan: (b: { friendNickname: string; amount: number; direction: 'lent' | 'borrowed'; concept?: string; dueDate?: string }) => http<Loan>('/loans', { body: b }),
  remind: (id: number, carinioLevel?: 0 | 1 | 2) => http<{ message: string; link: string; loan: Loan }>(`/loans/${id}/remind`, { method: 'POST', body: { carinioLevel: carinioLevel ?? 1 } }),
  payLoan: (id: number, method: 'yape' | 'cash', movementId?: number) => http<Loan>(`/loans/${id}/pay`, { body: { method, movementId } }),
  loanSuggestions: () => http<{ items: { loanId: number; movement: Movement; reason: string }[] }>('/loans/suggestions'),
  simulateConfirm: (id: number) => http<Loan>(`/loans/${id}/simulate-confirm`, { method: 'POST', body: {} }),
  split: (b: { total: number; mode: 'equal' | 'custom'; people: { nickname: string; amount?: number }[]; concept?: string }) => http<SplitResult>('/split', { body: b }),
  publicLoan: (t: string) => http<{ ownerFirstName: string; friendNickname: string; amount: number; concept: string | null; dueDate: string; direction: string; confirmed: boolean; paid: boolean }>(`/public/loans/${t}`, { auth: false }),
  confirmLoan: (t: string) => http<{ confirmed: boolean }>(`/public/loans/${t}/confirm`, { method: 'POST', body: {}, auth: false }),
  // perfil
  profile: () => http<Profile>('/profile'),
  profileHistory: () => http<{ items: { computedAt: string; score: number | null; level: string }[] }>('/profile/history'),
  simulateMonths: () => http<{ before: Profile; after: Profile }>('/demo/simulate-months', { method: 'POST', body: {} }),
  resetDemo: () => http<{ profile: Profile }>('/demo/reset', { method: 'POST', body: {} }),
  createCert: () => http<Certificate>('/certificates', { body: { consent: true } }),
  certs: () => http<{ items: Certificate[] }>('/certificates'),
  revokeCert: (code: string) => http<void>(`/certificates/${code}`, { method: 'DELETE' }),
  publicCert: (code: string) => http<Certificate>(`/public/certificates/${code}`, { auth: false }),
  exportData: () => http<unknown>('/privacy/export'),
  deleteAll: () => http<void>('/privacy/data', { method: 'DELETE', body: { confirm: 'ELIMINAR' } }),
  // amigos / actividad social
  friendsActivity: () => http<{ items: FriendActivity[] }>('/friends/demo-activity'),
  friendInviteLink: () => http<{ link: string; token: string }>('/friends/invite', { method: 'POST', body: {} }),
  friendJoin: (tok: string) => http<{ ok: boolean; message: string }>(`/friends/join/${tok}`, { method: 'POST', body: {} }),
  friendDonate: (friendshipId: number, amount: number, message?: string) => http<{ ok: boolean; message: string }>(`/friends/${friendshipId}/donate`, { body: { amount, message } }),
  categories: () => http<{ items: UserCategory[] }>('/categories'),
  addCategory: (b: { label: string; emoji?: string }) => http<{ items: UserCategory[] }>('/categories', { body: b }),
  deleteCategory: (key: string) => http<{ items: UserCategory[] }>(`/categories/${key}`, { method: 'DELETE' }),
};
