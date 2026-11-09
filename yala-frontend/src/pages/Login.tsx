import { useState } from 'react';
import { api } from '../api/yala';
import { Mascot } from '../components/Mascot';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const run = async (fn: () => Promise<{ token: string; user: import('../api/yala').User }>) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); login(r.token, r.user); } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); }
  };
  const google = async () => {
    try { window.location.href = (await api.googleUrl()).url; } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };

  return (
    <div className="login">
      <Mascot kind="goat" size={150} />
      <h1>Yala</h1>
      <p className="muted" style={{ maxWidth: 280 }}>Con Yala, cada yapeo cuenta.</p>
      <div style={{ width: '100%', maxWidth: 320, marginTop: 22, display: 'grid', gap: 10 }}>
        <button className="btn" disabled={busy} onClick={() => run(api.demo)}>Entrar como Diana (demo)</button>
        <button className="btn ghost" disabled={busy} onClick={google}>Continuar con Google</button>
        <button className="btn ghost" style={{ border: 0, fontSize: 12, color: 'var(--muted)' }} onClick={() => setDev(!dev)}>Entrar con otro correo (desarrollo)</button>
        {dev && (
          <div>
            <label className="field">Nombre<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field">Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button className="btn dark block" disabled={busy || !name || !email} onClick={() => run(() => api.devLogin({ name, email }))}>Entrar</button>
          </div>
        )}
        {err && <div className="center-note err" style={{ padding: 8 }}>{err}</div>}
      </div>
      <p className="disclaimer" style={{ maxWidth: 300, marginTop: 24 }}>Yala solo lee los correos de Yape (solo lectura) y nunca guarda el contenido del correo.</p>
    </div>
  );
}
