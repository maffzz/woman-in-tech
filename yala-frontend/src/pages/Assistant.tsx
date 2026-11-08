import { useEffect, useRef, useState } from 'react';
import { api, type Plan } from '../api/yala';
import { Mascot } from '../components/Mascot';
import { Header, Page } from '../components/Ui';
import { CAT_COLOR, soles } from '../lib/format';
import { useAuth } from '../lib/auth';

type Msg = { from: 'me' | 'ai'; text: string; plan?: Plan; applied?: boolean };

const CHIPS_WEEKLY = [
  'Priorizo comer y salidas, recibo S/ 60 semanales',
  'Quiero ahorrar más',
  'Priorizo transporte, recibo S/ 50 semanales',
];
const CHIPS_OUTING = [
  'Tengo S/ 40 para la salida del sábado',
  'Salgo con mis panas, tenemos S/ 30 en total',
  '¿Cómo divido S/ 25 para comer, pasajes y algo más?',
];

export default function Assistant() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([{
    from: 'ai',
    text: `Hola ${user?.name.split(' ')[0] ?? ''} 👋 Cuéntame cuánto recibes por semana y qué quieres priorizar, o dime cuánto tienes para una salida y te armo un plan.`,
  }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [chipMode, setChipMode] = useState<'weekly' | 'outing'>('weekly');
  // Mantiene el modo del último plan para que los follow-ups hereden el contexto
  const lastMode = useRef<'weekly' | 'outing'>('weekly');
  const end = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Auto-resize del textarea
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setText('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    setBusy(true);
    setMsgs((m) => [...m, { from: 'me', text: t }]);
    try {
      // Si el mensaje es solo un ajuste ("y con 30", "con 40 soles", "ajusta a 50")
      // hereda el modo del plan anterior en vez de redetectar desde cero
      const isAdjust = /^(y con|con |ajusta(lo)? a|mejor con|cambia a|ponlo en|que sea)\s*\d/i.test(t.trim());
      const forceOuting = isAdjust && lastMode.current === 'outing';

      const p = await api.plan(t, forceOuting ? true : undefined);
      lastMode.current = p.isOuting ? 'outing' : 'weekly';
      setMsgs((m) => [...m, { from: 'ai', text: p.reply, plan: p }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: 'ai', text: e instanceof Error ? e.message : 'No pude armar el plan' }]);
    } finally { setBusy(false); }
  };

  const apply = async (i: number, p: Plan) => {
    await api.applyPlan(p);
    setMsgs((m) =>
      m.map((x, k) => k === i ? { ...x, applied: true } : x)
       .concat({ from: 'ai', text: p.isOuting ? '¡Listo! Guardé esos montos como tope para esa salida.' : '¡Hecho! Ya puse esos topes por sección. Los ves en Inicio y en Secciones.' })
    );
  };

  const showChips = msgs.length === 1;

  return (
    <Page>
      <Header kicker="Asistente IA" title="Tu plan de plata" />

      <div className="chat">
        {msgs.map((m, i) => m.from === 'me' ? (
          <div key={i} className="bubble me">{m.text}</div>
        ) : (
          <div key={i} className="ai-row">
            <Mascot kind="goat" size={34} />
            <div className="bubble ai">
              {m.text}
              {m.plan && (
                <div style={{ marginTop: 10 }}>
                  {/* Barra proporcional */}
                  <div className="plan-bar">
                    {m.plan.items.map((it) => (
                      <div key={it.category} style={{ width: `${it.pct}%`, background: CAT_COLOR[it.category] ?? '#cfcde6' }} />
                    ))}
                  </div>
                  {/* Filas por categoría */}
                  {m.plan.items.map((it) => (
                    <div key={it.category} className="plan-row">
                      <span><i className="dot" style={{ background: CAT_COLOR[it.category] ?? '#cfcde6' }} />{it.label} {it.pct}%</span>
                      <b>{soles(it.amount, true)}</b>
                    </div>
                  ))}
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <button className="btn sm" style={{ flex: 1 }} disabled={m.applied} onClick={() => apply(i, m.plan!)}>
                      {m.applied ? 'Aplicado ✓' : 'Aplicar plan'}
                    </button>
                    <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { setText('Quiero ajustar el plan'); textareaRef.current?.focus(); }}>
                      Ajustar
                    </button>
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 11.5 }}>{m.plan.footnote}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="ai-row"><Mascot kind="goat" size={34} /><div className="bubble ai" style={{ opacity: 0.6 }}>Pensando…</div></div>}
        <div ref={end} />
      </div>

      {/* Chips de inicio rápido */}
      {showChips && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button className={'chip' + (chipMode === 'weekly' ? ' active' : '')} onClick={() => setChipMode('weekly')}>📅 Para la semana</button>
            <button className={'chip' + (chipMode === 'outing' ? ' active' : '')} onClick={() => setChipMode('outing')}>🎉 Para una salida</button>
          </div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {(chipMode === 'weekly' ? CHIPS_WEEKLY : CHIPS_OUTING).map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Composer con textarea autoexpandible */}
      <form
        className="composer"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => { e.preventDefault(); void send(text); }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }}
          placeholder="Escríbele a tu asistente"
          style={{ resize: 'none', overflow: 'hidden', lineHeight: '1.4', padding: '12px 16px', minHeight: 46 }}
        />
        <button className="send" type="submit" disabled={busy} aria-label="Enviar" style={{ flexShrink: 0, marginBottom: 2 }}>→</button>
      </form>
    </Page>
  );
}
