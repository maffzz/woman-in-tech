import { useEffect, useState } from 'react';
import { api, type Certificate, type Profile as P } from '../api/yala';
import { Sparkline } from '../components/Charts';
import { ErrorNote, Header, Loading, Page, Toast } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { shortDate } from '../lib/format';
import { useApi } from '../lib/useApi';

export default function Profile() {
  const { user, logout } = useAuth();
  const p = useApi(api.profile);
  const h = useApi(api.profileHistory);
  const c = useApi(api.certs);
  const [ba, setBa] = useState<{ before: P; after: P } | null>(null);
  const [consent, setConsent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  if (p.loading && !p.data) return <Page nav={false}><Loading /></Page>;
  if (p.error || !p.data) return <Page nav={false}><ErrorNote msg={p.error ?? 'Error'} retry={p.reload} /></Page>;
  const x = p.data;
  const reload = () => { p.reload(); h.reload(); c.reload(); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { setToast(e instanceof Error ? e.message : 'Error'); } finally { setBusy(false); } };

  return (
    <Page nav={false}>
      <Header back kicker="Tu historial financiero" title="Mi perfil" />
      <div className="card score-ring">
        <div className="n">{x.score ?? '—'}</div>
        <div style={{ fontWeight: 700, fontSize: 18, margin: '4px 0' }}>{x.level}{x.provisional && ' · provisional'}</div>
        <div className="l">{x.monthsOfHistory} {x.monthsOfHistory === 1 ? 'mes' : 'meses'} de historial{x.nextLevel ? ` · faltan ${x.nextLevel.pointsNeeded} pts para ${x.nextLevel.level}` : ''}</div>
        {(h.data?.items.length ?? 0) > 1 && <div style={{ marginTop: 8 }}><Sparkline data={h.data!.items.map((i) => i.score ?? 0)} w={200} h={40} /></div>}
      </div>
      <div className="card">
        {x.indicators.map((i) => (
          <div key={i.key} className="ind">
            <div className="row between"><span>{i.label}</span><b>{i.score ?? 'sin datos'}</b></div>
            <div className="progress"><div style={{ width: `${i.score ?? 0}%`, background: 'linear-gradient(90deg,#5fe8d8,#8f7bf0)' }} /></div>
          </div>
        ))}
      </div>
      {x.tips.length > 0 && <div className="card lav"><b style={{ fontSize: 14 }}>Cómo subir</b><ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>{x.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}

      {user?.isDemo && (
        <div className="card" style={{ border: '2px dashed var(--lav2)', boxShadow: 'none' }}>
          <b>Modo demo</b>
          <div className="muted" style={{ margin: '4px 0 10px' }}>Adelanta 3 meses con mejores hábitos para ver cómo sube tu perfil.</div>
          <div className="row">
            <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={() => run(async () => { setBa(await api.simulateMonths()); reload(); })}>Simular 3 meses</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await api.resetDemo(); setBa(null); reload(); setToast('Demo reiniciada'); })}>Reiniciar</button>
          </div>
          {ba && <div className="row between" style={{ marginTop: 12, fontWeight: 700 }}><span>{ba.before.level} ({ba.before.score})</span><span>→</span><span style={{ color: 'var(--teal-ink)' }}>{ba.after.level} ({ba.after.score})</span></div>}
        </div>
      )}

      <div className="section-title"><span>Compartir con mi banco</span></div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>El banco solo vería tu nivel, tus meses de historial y tus indicadores. Nunca tus movimientos ni a tus amigos. Tú decides y puedes retirarlo cuando quieras.</p>
        <label className="row" style={{ fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Acepto compartir mi perfil de hábitos por 30 días</label>
        <button className="btn block" disabled={!consent || busy} onClick={() => run(async () => { await api.createCert(); c.reload(); setToast('Certificado creado'); })}>Generar código para el banco</button>
        {c.data?.items.map((k: Certificate) => (
          <div key={k.code} className="list-row" style={{ alignItems: 'center' }}>
            <span><b>{k.code}</b>{k.isDemo && <span className="tag" style={{ marginLeft: 6 }}>demo</span>}<br /><span className="muted" style={{ fontSize: 11 }}>vence {shortDate(k.expiresAt)} · {k.views ?? 0} vistas</span></span>
            <span className="row">
              <a className="btn ghost sm" style={{ textDecoration: 'none' }} href={`/banco/${k.code}`} target="_blank" rel="noreferrer">Ver</a>
              {!k.revoked && <button className="btn danger sm" onClick={() => run(async () => { await api.revokeCert(k.code); c.reload(); })}>Retirar</button>}
            </span>
          </div>
        ))}
      </div>
      <p className="disclaimer">{x.disclaimer}</p>

      <div className="section-title"><span>Privacidad</span></div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={() => run(async () => { const d = await api.exportData(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'yala-mis-datos.json'; a.click(); })}>Descargar mis datos</button>
        <button className="btn ghost sm" onClick={logout}>Cerrar sesión</button>
        <button className="btn danger sm" onClick={() => { if (confirm('Esto borra tu cuenta y todos tus datos. ¿Seguro?')) void run(async () => { await api.deleteAll(); logout(); }); }}>Borrar todo</button>
      </div>
      <Toast msg={toast} />
    </Page>
  );
}
