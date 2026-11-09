import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Category, type Movement } from '../api/yala';
import { Header, Page, Sheet, Toast } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/useApi';
import { CAT_LABEL, soles } from '../lib/format';

const ORDER: Category[] = ['comida', 'transporte', 'juegos', 'entretenimiento', 'recargas', 'salidas', 'suscripciones', 'ahorro', 'otros'];

// ─── Tarjeta de confirmación de gasto importado ───────────────────────────────
function ImportedMovementCard({ m, onConfirm, onCategoryChange }: {
  m: Movement;
  onConfirm: () => void;
  onCategoryChange: (id: number, cat: Category) => void;
}) {
  const [showCats, setShowCats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleConfirm = () => { setDone(true); onConfirm(); };

  const handleCat = async (cat: Category) => {
    setBusy(true);
    await api.setCategory(m.id, cat);
    setBusy(false);
    setShowCats(false);
    setDone(true);
    onCategoryChange(m.id, cat);
  };

  if (done) return null;

  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: '14px 16px', marginBottom: 10,
      boxShadow: '0 2px 14px rgba(60,40,140,.10)', border: '2px solid var(--lav2)',
      animation: 'pop-in .25s ease',
    }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{m.counterparty ?? 'Sin nombre'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{m.aiOpinion}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{soles(m.amount, true)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.type === 'income' ? 'ingreso' : 'gasto'}</div>
        </div>
      </div>

      {/* Categoría detectada */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>La IA lo puso en</span>
        <button
          onClick={() => setShowCats(!showCats)}
          style={{ background: 'var(--lav2)', border: 0, borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}
        >
          {CAT_LABEL[m.category] ?? m.category} {showCats ? '▲' : '▼'}
        </button>
      </div>

      {/* Chips de categoría (desplegable) */}
      {showCats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {ORDER.map((k) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => handleCat(k)}
              style={{
                background: k === m.category ? 'var(--teal)' : 'var(--lav)',
                border: 0, borderRadius: 99, padding: '5px 12px', fontSize: 12,
                fontWeight: k === m.category ? 700 : 500, cursor: 'pointer', color: 'var(--ink)',
              }}
            >
              {CAT_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{ flex: 1, fontSize: 13 }}
          onClick={handleConfirm}
        >
          ✓ Está bien
        </button>
        {!showCats && (
          <button
            className="btn ghost"
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => setShowCats(true)}
          >
            Cambiar categoría
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function Connect() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const g = useApi(api.gmailStatus);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Gastos recién importados esperando confirmación
  const [pending, setPending] = useState<Movement[]>(() => {
    // Recuperar movimientos pendientes del auto-sync (si los hay)
    try {
      const saved = sessionStorage.getItem('yala_pending_review');
      if (saved) { sessionStorage.removeItem('yala_pending_review'); return JSON.parse(saved); }
    } catch { /* */ }
    return [];
  });

  // Escuchar nuevos movimientos del auto-sync en tiempo real
  useEffect(() => {
    const handler = (e: Event) => {
      const mv = (e as CustomEvent<Movement[]>).detail;
      if (mv?.length) setPending((p) => [...mv, ...p]);
    };
    window.addEventListener('yala:new-movements', handler);
    return () => window.removeEventListener('yala:new-movements', handler);
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const s = sp.get('gmail');
    if (s === 'connected') { setToast('Gmail conectado ✓ — sincroniza para importar tus correos'); g.reload(); }
    if (s === 'denied') setToast('No diste el permiso de Gmail');
  }, [sp]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  const handleSync = async () => {
    try {
      const r = await api.gmailSync();
      if (r.imported > 0) {
        // Cargar los movimientos recién importados para mostrar confirmación
        const mv = await api.movements({ limit: r.imported, offset: 0 });
        setPending((prev) => [...mv.items.slice(0, r.imported), ...prev]);
        setToast(`${r.imported} gasto${r.imported > 1 ? 's' : ''} nuevo${r.imported > 1 ? 's' : ''} — revisa y confirma abajo`);
      } else if (r.duplicates > 0) {
        setToast('Todo al día, no hay correos nuevos.');
      } else {
        setToast('No encontré correos de Yape o BCP.');
      }
      g.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('venció') || msg.includes('revocado') || msg.includes('token') || msg.includes('500')) {
        setToast('El permiso de Gmail venció — reconecta tu cuenta.');
        g.reload();
      } else {
        setToast('Error al sincronizar. Intenta reconectar Gmail.');
      }
    }
  };

  const handlePaste = async () => {
    const r = await api.paste(text);
    if (r.imported > 0) {
      // Mostrar los gastos importados para confirmación
      setPending((prev) => [...r.items, ...prev]);
      const allowanceMsg = r.allowanceUpdated && r.newAllowance ? ` · Mesada actualizada a S/ ${r.newAllowance}` : '';
      setToast(`${r.imported} gasto${r.imported > 1 ? 's' : ''} importado${r.imported > 1 ? 's' : ''} — revisa abajo${allowanceMsg}`);
      setText('');
      await refresh();
    } else {
      const parts = [
        r.duplicates > 0 ? `${r.duplicates} ya estaban` : '',
        r.unparsed > 0 ? `${r.unparsed} no pude leer` : '',
      ].filter(Boolean).join(' · ');
      setToast(parts || 'No encontré gastos en el texto');
    }
  };

  const dismissAll = () => setPending([]);

  return (
    <Page nav={false}>
      <Header back kicker="De dónde salen tus datos" title="Conectar Yape"
        right={<button className="icon-btn" onClick={() => nav('/')} aria-label="Ir al inicio" style={{ fontSize: 20 }}>🏠</button>}
      />

      <div className="card lav" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Yala solo lee correos de Yape y BCP, en modo lectura. Guarda únicamente monto, fecha y destinatario. <b>Nunca guarda el contenido del correo.</b>
      </div>

      {/* ── Gastos pendientes de confirmación ── */}
      {pending.length > 0 && (
        <>
          <div className="section-title">
            <span>Revisa y confirma ({pending.length})</span>
            <button style={{ background: 'none', border: 0, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }} onClick={dismissAll}>
              Confirmar todos
            </button>
          </div>
          {pending.map((m) => (
            <ImportedMovementCard
              key={m.id}
              m={m}
              onConfirm={() => setPending((p) => p.filter((x) => x.id !== m.id))}
              onCategoryChange={(id, cat) => setPending((p) => p.map((x) => x.id === id ? { ...x, category: cat } : x).filter((x) => x.id !== id))}
            />
          ))}
        </>
      )}

      {/* ── Gmail ── */}
      <div className="section-title"><span>Gmail</span></div>
      <div className="card">
        {!g.data?.configured && (
          <p className="muted" style={{ marginTop: 0 }}>
            Gmail no está configurado en el servidor. Usa el modo "Pegar correo" o la demo.
          </p>
        )}
        {g.data?.connected ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: '#2abf9a', fontWeight: 700 }}>● Conectado</span>
              {g.data.lastSyncAt ? ` · última sync ${new Date(g.data.lastSyncAt).toLocaleDateString('es-PE')}` : ' · nunca sincronizado'}
              {g.data.unparsedEmails > 0 && <><br /><span className="muted" style={{ fontSize: 11.5 }}>{g.data.unparsedEmails} correos no pude leer.</span></>}
            </div>
            <div className="row">
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => run(handleSync)}>
                Sincronizar ahora
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await api.gmailDisconnect(); g.reload(); setToast('Gmail desconectado.'); })}>
                Desconectar
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
              Busca correos de los últimos 90 días de {g.data.senderFilter}.
            </p>
          </>
        ) : (
          <>
            <button className="btn block" disabled={busy || !g.data?.configured}
              onClick={() => run(async () => { window.location.href = (await api.gmailConnectUrl()).url; })}>
              Conectar Gmail (solo lectura)
            </button>
            {g.data?.configured && (
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>
                Solo leeremos correos de Yape y BCP. Nunca el resto de tu bandeja.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Pegar correo ── */}
      <div className="section-title"><span>O pega un correo de Yape / BCP</span></div>
      <div className="card">
        <label className="field" style={{ marginBottom: 10 }}>
          Pega aquí uno o varios (sepáralos con ---)
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Realizaste un consumo de S/ 29.00 con tu Tarjeta de Débito BCP en TAMBO+.\nFecha: 8 de noviembre de 2026, 07:15 a. m.`}
          />
        </label>
        <button className="btn block" disabled={busy || text.trim().length < 5}
          onClick={() => run(handlePaste)}>
          Leer y guardar
        </button>
      </div>

      {/* ── Modo de datos ── */}
      <div className="section-title"><span>Modo de datos</span></div>
      <div className="tabs">
        {(['demo', 'pegado', 'gmail'] as const).map((m) => (
          <button key={m} className={user?.dataMode === m ? 'active' : ''}
            onClick={() => run(async () => { await api.patchMe({ dataMode: m }); await refresh(); })}>
            {m === 'demo' ? 'Demo' : m === 'pegado' ? 'Pegado' : 'Gmail'}
          </button>
        ))}
      </div>

      <Toast msg={toast} />
    </Page>
  );
}
