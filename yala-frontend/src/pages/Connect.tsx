import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/yala';
import { Header, Page, Toast } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';

export default function Connect() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const g = useApi(api.gmailStatus);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { const s = sp.get('gmail'); if (s === 'connected') setToast('Gmail conectado ✓'); if (s === 'denied') setToast('No diste el permiso'); }, [sp]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { setToast(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); } };

  return (
    <Page nav={false}>
      <Header back kicker="De dónde salen tus datos" title="Conectar Yape" right={<button className="icon-btn" onClick={() => nav('/')} aria-label="Ir al inicio" style={{ fontSize: 20 }}>🏠</button>} />
      <div className="card lav" style={{ fontSize: 13, lineHeight: 1.5 }}>Yala solo lee los correos de Yape, en modo lectura, y guarda únicamente monto, fecha y destinatario. <b>Nunca guarda el contenido del correo.</b> Puedes desconectar cuando quieras.</div>

      <div className="section-title"><span>Gmail</span></div>
      <div className="card">
        {!g.data?.configured && <p className="muted" style={{ marginTop: 0 }}>El servidor aún no tiene Gmail configurado. Mientras tanto usa el modo demo o pega tus correos abajo.</p>}
        {g.data?.connected ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Conectado ✓ {g.data.lastSyncAt ? `· última lectura ${g.data.lastSyncAt}` : ''}{g.data.unparsedEmails > 0 && <><br /><span className="muted">{g.data.unparsedEmails} correos no pude leer.</span></>}</div>
            <div className="row">
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => run(async () => { const r = await api.gmailSync(); setToast(`${r.imported} nuevos · ${r.duplicates} ya estaban · ${r.unparsed > 0 ? r.unparsed + ' no entendí' : ''}`); g.reload(); })}>Sincronizar ahora</button>
              <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await api.gmailDisconnect(); g.reload(); })}>Desconectar</button>
            </div>
          </>
        ) : <button className="btn block" disabled={busy || !g.data?.configured} onClick={() => run(async () => { window.location.href = (await api.gmailConnectUrl()).url; })}>Conectar Gmail (solo lectura)</button>}
      </div>

      <div className="section-title"><span>O pega tus correos de Yape</span></div>
      <div className="card">
        <label className="field" style={{ marginBottom: 10 }}>Pega aquí uno o varios (sepáralos con una línea ---)<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="¡Yapeaste S/ 12.50! Destinatario: Bodega Los Andes…" /></label>
        <button className="btn block" disabled={busy || text.trim().length < 5} onClick={() => run(async () => {
          const r = await api.paste(text);
          const parts = [`${r.imported} guardados`, r.duplicates > 0 ? `${r.duplicates} repetidos` : '', r.unparsed > 0 ? `${r.unparsed} no entendí` : ''].filter(Boolean).join(' · ');
          const allowanceMsg = r.allowanceUpdated && r.newAllowance ? ` 💰 Mesada actualizada a S/ ${r.newAllowance}` : '';
          setToast(parts + allowanceMsg);
          if (r.imported) { setText(''); await refresh(); }
        })}>Leer y guardar</button>
      </div>

      <div className="section-title"><span>Modo de datos</span></div>
      <div className="tabs">
        {(['demo', 'pegado', 'gmail'] as const).map((m) => <button key={m} className={user?.dataMode === m ? 'active' : ''} onClick={() => run(async () => { await api.patchMe({ dataMode: m }); await refresh(); })}>{m === 'demo' ? 'Demo' : m === 'pegado' ? 'Pegado' : 'Gmail'}</button>)}
      </div>
      <Toast msg={toast} />
    </Page>
  );
}
