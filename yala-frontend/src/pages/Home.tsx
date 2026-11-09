import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/yala';
import { Progress, Sparkline } from '../components/Charts';
import { Mascot, type MascotKey } from '../components/Mascot';
import { ErrorNote, Header, Loading, Page } from '../components/Ui';
import { greeting, firstName, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
const SECS = [['comida', '#5fe8d8'], ['transporte', '#8fd3f7'], ['salidas', '#e4a8f0'], ['suscripciones', '#8f7bf0']] as const;
const LABEL: Record<string, string> = { comida: 'Comida', transporte: 'Transporte', salidas: 'Salidas', suscripciones: 'Suscrip.' };
const levelKey = (name: string): MascotKey => {
  const m: Record<string, MascotKey> = { pollito: 'pollito', colibrí: 'colibri', conejo: 'conejo', oveja: 'oveja', goat: 'goat' };
  return m[name.toLowerCase()] ?? 'pollito';
};

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 5 }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: '1.5px solid currentColor', borderRadius: '50%', width: 16, height: 16, fontSize: 10, lineHeight: '14px', cursor: 'pointer', padding: 0, opacity: 0.6, verticalAlign: 'middle' }} aria-label="Más info">i</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.5, width: 200, zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>{text}</div>
        </>
      )}
    </span>
  );
}

/** Mascota flotante que sirve de asistente — consejo del día sale de ella */
function MascotAssistant({ mascotKind, adviceText, onOpenAssistant }: {
  mascotKind: MascotKey;
  adviceText: string;
  onOpenAssistant: () => void;
}) {
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);

  return (
    <>
      {/* Mascota flotante */}
      <div style={{ position: 'fixed', bottom: 'calc(88px + env(safe-area-inset-bottom))', right: 18, zIndex: 30 }}>
        {/* Burbuja de consejo (aparece al tocar la mascota) */}
        {bubbleOpen && (
          <div style={{
            position: 'absolute', bottom: 70, right: 0, width: 220,
            background: '#fff', borderRadius: 18, padding: '12px 14px',
            boxShadow: '0 4px 24px rgba(42,26,107,.2)',
            border: '2px solid var(--lav2)', animation: 'pop-in .2s ease',
          }}>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink)', marginBottom: 8 }}>
              {adviceText}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setFullOpen(true); setBubbleOpen(false); }}
                style={{ flex: 1, background: 'var(--purple)', color: '#fff', border: 0, borderRadius: 10, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Ver más
              </button>
              <button
                onClick={onOpenAssistant}
                style={{ flex: 1, background: 'var(--lav2)', border: 0, borderRadius: 10, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Preguntarle
              </button>
            </div>
            {/* Triángulo apuntando a la mascota */}
            <div style={{
              position: 'absolute', bottom: -8, right: 18,
              width: 0, height: 0,
              borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
              borderTop: '8px solid var(--lav2)',
            }} />
          </div>
        )}

        {/* La mascota en sí */}
        <button
          onClick={() => setBubbleOpen(!bubbleOpen)}
          aria-label="Abrir consejo de tu mascota"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            filter: 'drop-shadow(0 4px 12px rgba(107,73,212,.35))',
            transition: 'transform .15s',
            transform: bubbleOpen ? 'scale(1.1)' : 'scale(1)',
          }}
        >
          <Mascot kind={mascotKind} size={58} />
        </button>
      </div>

      {/* Modal completo del consejo */}
      {fullOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(42,26,107,0.5)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setFullOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, padding: 28, maxWidth: 360, width: '100%',
            textAlign: 'center', boxShadow: '0 8px 40px rgba(42,26,107,0.25)',
          }} onClick={(e) => e.stopPropagation()}>
            <Mascot kind={mascotKind} size={80} style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Consejo del día</div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>{adviceText}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onOpenAssistant}>
                Hablar con tu asistente
              </button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setFullOpen(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const d = useApi(api.dashboard);
  const b = useApi(api.budgets);
  const [hasPending, setHasPending] = useState(false);

  // Detectar si hay gastos pendientes de revisión del auto-sync
  useEffect(() => {
    const check = () => setHasPending(!!sessionStorage.getItem('yala_pending_review'));
    check();
    window.addEventListener('yala:new-movements', check);
    return () => window.removeEventListener('yala:new-movements', check);
  }, []);

  if (d.loading && !d.data) return <Page><Loading /></Page>;
  if (d.error || !d.data) return <Page><ErrorNote msg={d.error ?? 'Error'} retry={d.reload} /></Page>;
  const x = d.data;

  return (
    <Page>
      <Header kicker={`Hola, ${firstName(user?.name ?? '')}`} title={greeting()} right={<Link className="pill" to="/niveles">Nivel {x.level.number} · {x.level.name}</Link>} />

      {/* Banner de gastos nuevos del auto-sync */}
      {hasPending && (
        <button
          onClick={() => nav('/conectar')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none',
            background: 'linear-gradient(135deg, #6b49d4, #8f7bf0)',
            borderRadius: 18, padding: '14px 16px', cursor: 'pointer', marginBottom: 14,
            animation: 'pop-in .25s ease',
          }}
        >
          <span style={{ fontSize: 26 }}>📩</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>Tienes gastos nuevos</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>Toca para revisar y confirmar categorías</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 18 }}>›</span>
        </button>
      )}

      {/* Card mascota + racha */}
      <div className="card hero">
        <div className="blob"><Mascot kind={levelKey(x.level.name)} size={118} /></div>
        <div className="lvl">{x.level.name}</div>
        <div className="muted" style={{ margin: '2px 0 10px' }}>Racha: {x.level.streakWeeks} {x.level.streakWeeks === 1 ? 'semana' : 'semanas'} dentro del presupuesto</div>
        <Progress pct={(x.level.streakWeeks / Math.max(1, x.level.goatWeeks)) * 100} />
        <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>{x.level.weeksToGoat > 0 ? `Faltan ${x.level.weeksToGoat} semanas para ser GOAT` : '¡Ya eres GOAT!'}</div>
      </div>

      {/* Consejo del día — burbuja */}
      <button
        className="advice-bubble"
        onClick={() => {}}
        style={{ pointerEvents: 'none', opacity: 0.5 }}
        aria-hidden
      >
        <span style={{ fontSize: 20 }}>💡</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Toca a tu mascota para el consejo del día →</span>
      </button>
      {/* Stats */}
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
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>{soles(x.savings.thisWeek, true)}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>meta: {soles(x.savings.goal)}/semana</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 6, background: 'var(--lav2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, x.savings.goal > 0 ? (x.savings.thisWeek / x.savings.goal) * 100 : 0)}%`, background: 'var(--purple)', borderRadius: 99, transition: 'width .5s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Deuda pendiente — justo debajo de stats, resaltada */}
      {x.social.nextDue && (
        <Link
          to="/amigos"
          style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
            background: x.social.nextDue.direction === 'lent' ? 'var(--mint)' : '#fff3e0',
            border: `2px solid ${x.social.nextDue.direction === 'lent' ? '#2abf9a' : '#f59e0b'}`,
            borderRadius: 18, padding: '14px 16px', marginBottom: 14, marginTop: 10 }}
        >
          <span style={{ fontSize: 28 }}>{x.social.nextDue.direction === 'lent' ? '💰' : '⏰'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              {x.social.nextDue.direction === 'lent'
                ? `${x.social.nextDue.friend} te debe ${soles(x.social.nextDue.amount)}`
                : `Le debes ${soles(x.social.nextDue.amount)} a ${x.social.nextDue.friend}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {x.social.nextDue.direction === 'lent' ? 'Vence pronto · cobrar con cariño' : 'Recuerda pagar a tiempo y sumas puntos'}
            </div>
          </div>
          <span style={{ fontSize: 18, color: 'var(--muted)' }}>›</span>
        </Link>
      )}

      {/* Círculos de presupuesto */}
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

      {/* Accesos rápidos */}
      <div className="quick">
        <Link to="/conectar" className="quick-wide"><span>📩</span>Conectar Yape</Link>
        <Link to="/asistente"><span>🤖</span>Asistente</Link>
        <Link to="/niveles"><span>🐐</span>Mis niveles</Link>
      </div>

      {/* Mascota flotante — asistente + consejo del día */}
      <MascotAssistant
        mascotKind={levelKey(x.level.name)}
        adviceText={x.advice.text}
        onOpenAssistant={() => nav('/asistente')}
      />
    </Page>
  );
}
