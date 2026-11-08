import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from '../api/yala';
import { getToken, setToken } from '../api/client';

interface Ctx { user: User | null; ready: boolean; login: (token: string, user: User) => void; logout: () => void; refresh: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  const refresh = useCallback(async () => { try { setUser(await api.me()); } catch { setUser(null); } }, []);

  useEffect(() => {
    // Tras Google OAuth el backend redirige a /?token=...
    const q = new URLSearchParams(window.location.search);
    const t = q.get('token');
    if (t) { setToken(t); q.delete('token'); window.history.replaceState({}, '', window.location.pathname + (q.toString() ? '?' + q : '')); }
    (async () => { if (getToken()) await refresh(); setReady(true); })();
    const onOut = () => setUser(null);
    window.addEventListener('yala:logout', onOut);
    return () => window.removeEventListener('yala:logout', onOut);
  }, [refresh]);

  return <AuthCtx.Provider value={{ user, ready, login: (t, u) => { setToken(t); setUser(u); }, logout, refresh }}>{children}</AuthCtx.Provider>;
}
