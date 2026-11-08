const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';

const KEY = 'yala_token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* sin storage */ } };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function http<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(token && init.auth !== false ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No pude conectar con el servidor. ¿Está prendido el backend?', 'network');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && init.auth !== false) { setToken(null); window.dispatchEvent(new Event('yala:logout')); }
    throw new ApiError(res.status, data?.error ?? 'Algo salió mal', data?.code);
  }
  return data as T;
}
