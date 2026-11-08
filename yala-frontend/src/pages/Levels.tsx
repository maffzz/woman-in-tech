import { useState } from 'react';
import { api, type WeeklySummary } from '../api/yala';
import { Progress } from '../components/Charts';
import { Mascot, type MascotKey } from '../components/Mascot';
import { ErrorNote, Header, Loading, Page } from '../components/Ui';
import { CAT_LABEL, soles } from '../lib/format';
import { useApi } from '../lib/useApi';

const POINT_ACTIONS = [
  { icon: '📅', text: 'Terminar la semana sin pasarte de tu mesada', points: '+racha' },
  { icon: '⏰', text: 'Devolver un préstamo antes de la fecha acordada', points: '+puntos' },
  { icon: '✅', text: 'Salir con presupuesto y quedarte dentro', points: '+puntos' },
  { icon: '📩', text: 'Cobrar lo que te deben (recordatorio amable)', points: '+puntos' },
  { icon: '🐖', text: 'Ahorrar algo cada semana', points: '+puntos' },
];

const NEG_ACTIONS = [
  { icon: '💸', text: 'Pasarte de tu mesada semanal', effect: 'rompe la racha' },
  { icon: '❌', text: 'Que un amigo no pague NO te baja puntos', effect: 'no afecta' },
  { icon: '🚀', text: 'Prestar más de lo que recibes no suma', effect: 'sin efecto' },
];

export default function Levels() {
  const l = useApi(api.levels);
  const [showSummary, setShowSummary] = useState(false);

  if (l.loading && !l.data) return <Page><Loading /></Page>;
  if (l.error || !l.data) return <Page><ErrorNote msg={l.error ?? 'Error'} retry={l.reload} /></Page>;
  const x = l.data;

  const yearsLeft = x.daysTo18 !== null ? (x.daysTo18 / 365).toFixed(1) : null;
  const goalLabel = x.daysTo18 === 0
    ? '¡Ya tienes 18! Puedes compartir tu perfil con el banco.'
    : x.daysTo18 !== null
      ? `Faltan ~${yearsLeft} años para los 18 · ${x.weeksToGoat} semanas de racha`
      : `Meta: ${x.goatWeeks} semanas seguidas dentro del presupuesto`;

  return (
    <Page>
      <Header kicker="Niveles" title="Tu evolución" />

      {/* Racha */}
      <div className="streak">
        <div className="row between" style={{ fontSize: 13, marginBottom: 8 }}>
          <b>Racha: {x.streakWeeks} semanas</b>
          <span>Meta: {x.goatWeeks} sem.</span>
        </div>
        <Progress pct={x.goatWeeks > 0 ? (x.streakWeeks / x.goatWeeks) * 100 : 100} tone="purple" />
        <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>{goalLabel}</div>
      </div>

      {/* Botón resumen semanal */}
      <button
        onClick={() => setShowSummary(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--lav)', border: 'none', borderRadius: 18, padding: '14px 18px', width: '100%', cursor: 'pointer', marginBottom: 14, textAlign: 'left' }}
      >
        <span style={{ fontSize: 26 }}>📊</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Resumen de esta semana</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ver cuánto gastaste y qué mejorar</div>
        </div>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 18 }}>›</span>
      </button>

      {/* Si ya tiene 18 */}
      {x.daysTo18 === 0 && (
        <div className="card lav" style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
          <b style={{ fontSize: 16 }}>¡Ya puedes usar tu historial!</b>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Ve a tu perfil y genera un certificado para compartir con el banco.</p>
        </div>
      )}

      {/* Lista de niveles */}
      {x.levels.map((lv) => (
        <div key={lv.key} className={'level ' + lv.status}>
          <Mascot kind={lv.key as MascotKey} size={46} locked={lv.status === 'locked'} />
          <div>
            <div className="name">{lv.name}</div>
            <div className="hint">{lv.hint}</div>
          </div>
          <span className={'badge ' + (lv.status === 'current' ? 'cur' : lv.status === 'locked' ? 'lock' : '')}>
            {lv.status === 'done' ? 'Listo ✓' : lv.status === 'current' ? 'Aquí' : 'Bloqueado'}
          </span>
        </div>
      ))}
      {x.nextLevel && (
        <p className="muted" style={{ textAlign: 'center' }}>
          Para ser {x.nextLevel.name} te {x.nextLevel.weeksNeeded === 1 ? 'falta' : 'faltan'} {x.nextLevel.weeksNeeded} {x.nextLevel.weeksNeeded === 1 ? 'semana' : 'semanas'}.
        </p>
      )}

      {/* Cómo subir puntos */}
      <div className="section-title" style={{ marginTop: 20 }}><span>Qué sube tu nivel</span></div>
      <div className="card">
        {POINT_ACTIONS.map((a) => (
          <div key={a.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{a.icon}</span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{a.text}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2abf9a', background: 'var(--mint)', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>{a.points}</span>
          </div>
        ))}
      </div>

      <div className="section-title"><span>Reglas importantes</span></div>
      <div className="card lav">
        {NEG_ACTIONS.map((a) => (
          <div key={a.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{a.icon}</span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{a.text}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--lav2)', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>{a.effect}</span>
          </div>
        ))}
      </div>

      {/* Modal de resumen semanal */}
      {showSummary && <WeeklySummaryModal onClose={() => setShowSummary(false)} />}
    </Page>
  );
}

function WeeklySummaryModal({ onClose }: { onClose: () => void }) {
  const s = useApi(api.weeklySummary);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,107,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '24px 24px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', maxHeight: '88dvh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <b style={{ fontSize: 18 }}>📊 Resumen semanal</b>
          <button onClick={onClose} style={{ background: 'var(--lav2)', border: 0, borderRadius: '50%', width: 32, height: 32, fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        {s.loading && <div className="center-note">Cargando…</div>}
        {s.error && <div className="center-note err">{s.error}</div>}
        {s.data && <SummaryContent d={s.data} />}
      </div>
    </div>
  );
}

function SummaryContent({ d }: { d: WeeklySummary }) {
  const withinColor = d.lastWeek.within ? '#2abf9a' : '#f59e0b';
  const withinBg = d.lastWeek.within ? 'var(--mint)' : '#fff3e0';

  return (
    <>
      {/* Estado general de la semana pasada */}
      <div style={{ background: withinBg, borderRadius: 16, padding: '14px 16px', marginBottom: 14, border: `2px solid ${withinColor}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 4 }}>
          {d.lastWeek.within ? '✅ Semana dentro del presupuesto' : '⚠️ Te pasaste del presupuesto'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Gastaste <b style={{ color: 'var(--ink)' }}>{soles(d.lastWeek.total, true)}</b> de {soles(d.allowance, true)} disponibles
        </div>
        {d.streakEffect && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#2abf9a' }}>{d.streakEffect}</div>
        )}
      </div>

      {/* Desglose por categoría */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Dónde fue tu plata</div>
      {d.lastWeek.byCategory.slice(0, 6).map((c) => (
        <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <span style={{ color: 'var(--ink)' }}>{CAT_LABEL[c.category] ?? c.category}</span>
          <b>{soles(c.spent, true)}</b>
        </div>
      ))}

      {/* Categorías que se pasaron */}
      {d.overBudget.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 16, marginBottom: 8 }}>Te pasaste del tope en</div>
          {d.overBudget.map((c) => (
            <div key={c.category} style={{ background: '#fff3e0', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <b>{CAT_LABEL[c.category] ?? c.category}</b>
                <span style={{ color: '#92400e' }}>+S/ {c.over} sobre el tope</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Gastaste {soles(c.spent, true)} · tope era {soles(c.cap, true)}</div>
            </div>
          ))}
        </>
      )}

      {/* Sugerencias */}
      {d.suggestions.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 16, marginBottom: 8 }}>Para la próxima semana</div>
          {d.suggestions.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
              <span style={{ color: 'var(--ink)', lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
        </>
      )}

      {/* Esta semana en curso */}
      {d.thisWeek.total > 0 && (
        <div style={{ background: 'var(--lav)', borderRadius: 14, padding: '12px 14px', marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Esta semana (en curso)</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{soles(d.thisWeek.total, true)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>de {soles(d.allowance, true)}</span></div>
        </div>
      )}
    </>
  );
}
