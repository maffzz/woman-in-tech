import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/yala';
import { Bars, Progress, Sparkline } from '../components/Charts';
import { Mascot, type MascotKey } from '../components/Mascot';
import { ErrorNote, Header, Loading, Page } from '../components/Ui';
import { greeting, firstName, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';

const SECS = [['comida', '#5fe8d8'], ['transporte', '#8fd3f7'], ['salidas', '#e4a8f0'], ['suscripciones', '#8f7bf0']] as const;
const LABEL: Record<string, string> = { comida: 'Comida', transporte: 'Transporte', salidas: 'Salidas', suscripciones: 'Suscrip.' };
const levelKey = (name: string) => name.toLowerCase() as MascotKey;

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 5 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: '1.5px solid currentColor', borderRadius: '50%', width: 16, height: 16, fontSize: 10, lineHeight: '14px', cursor: 'pointer', padding: 0, opacity: 0.6, verticalAlign: 'middle' }}
        aria-label="Más info"
      >i</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.5, width: 200, zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
            {text}
          </div>
        </>
      )}
    </span>
  );
}

export default function Home() {
  const { user } = useAuth();
  const d = useApi(api.dashboard);
  const b = useApi(api.budgets);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!d.data) return;
    try { setDone(localStorage.getItem('yala_reto') === d.data.advice.day); } catch { /* sin storage */ }
  }, [d.data]);

  if (d.loading && !d.data) return <Page><Loading /></Page>;
  if (d.error || !d.data) return <Page><ErrorNote msg={d.error ?? 'Error'} retry={d.reload} /></Page>;
  const x = d.data;
  const markDone = () => { setDone(true); try { localStorage.setItem('yala_reto', x.advice.day); } catch { /* sin storage */ } };

  return (
    <Page>
      <Header kicker={`Hola, ${firstName(user?.name ?? '')}`} title={greeting()} right={<Link className="pill" to="/niveles">Nivel {x.level.number} · {x.level.name}</Link>} />

      <div className="card hero">
        <div className="blob"><Mascot kind={levelKey(x.level.name)} size={118} /></div>
        <div className="lvl">{x.level.name}</div>
        <div className="muted" style={{ margin: '2px 0 10px' }}>Racha: {x.level.streakWeeks} {x.level.streakWeeks === 1 ? 'semana' : 'semanas'} dentro del presupuesto</div>
        <Progress pct={(x.level.streakWeeks / x.level.goatWeeks) * 100} />
        <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>{x.level.weeksToGoat > 0 ? `Faltan ${x.level.weeksToGoat} semanas para ser GOAT` : '¡Ya eres GOAT!'}</div>
      </div>

      <div className="reto">
        <div><b>Consejo del día</b><span>{x.advice.text}</span></div>
        <button className="btn white sm" onClick={markDone} disabled={done}>{done ? '✓' : 'Listo'}</button>
      </div>

      <div className="section-title"><span>Stats de hoy</span><Link to="/secciones">Ver todo</Link></div>
      <div className="stats">
        <div className="stat" style={{ background: 'var(--cyan)' }}>
          <small>Hormigas <InfoTooltip text="Gastos menores a S/ 5 que parecen insignificantes pero se acumulan. En esto se va la plata sin que te des cuenta." /></small>
          <div style={{ marginTop: 4 }}><Sparkline data={x.hormiga.daily} /></div>
          <div className="big">{soles(x.hormiga.weekTotal, true)}<small>esta semana</small></div>
          {x.hormiga.count > 0 && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{x.hormiga.count} gastos chicos este mes</div>}
        </div>
        <div className="stat" style={{ background: 'var(--blue)' }}>
          <small>Ahorro esta semana</small>
          <div style={{ marginTop: 4 }}><Bars data={x.savings.weeks} /></div>
          <div className="big">{soles(x.savings.thisWeek, true)}<small>de {soles(x.savings.goal)} meta</small></div>
        </div>
      </div>

      <div className="section-title"><span>Te quedan por sección</span></div>
      <div className="circles">
        {SECS.map(([c, color]) => {
          const row = b.data?.items.find((i) => i.category === c);
          const left = row?.remaining;
          return (
            <Link key={c} to={`/secciones?c=${c}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="circle" style={{ borderColor: color }}>{left === null || left === undefined ? '—' : soles(Math.max(0, left))}</div>
              <div className="circle-label">{LABEL[c]}</div>
            </Link>
          );
        })}
      </div>

      <div className="quick">
        <Link to="/conectar" className="quick-wide"><span>📩</span>Conectar Yape</Link>
        <Link to="/asistente"><span>🤖</span>Asistente</Link>
        <Link to="/niveles"><span>🐐</span>Mis niveles</Link>
      </div>
      {x.social.nextDue && (
        <Link to="/amigos" className="card lav" style={{ display: 'block', marginTop: 14, textDecoration: 'none', color: 'inherit', fontSize: 13 }}>
          {x.social.nextDue.direction === 'lent' ? `${x.social.nextDue.friend} te debe ${soles(x.social.nextDue.amount)}` : `Le debes ${soles(x.social.nextDue.amount)} a ${x.social.nextDue.friend}`} · ver detalle
        </Link>
      )}
    </Page>
  );
}
