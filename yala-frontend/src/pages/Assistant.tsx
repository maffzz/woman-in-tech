import { useEffect, useRef, useState } from 'react';
import { api, type Plan } from '../api/yala';
import { Mascot } from '../components/Mascot';
import { Header, Page } from '../components/Ui';
import { CAT_COLOR, soles } from '../lib/format';
import { useAuth } from '../lib/auth';

type Msg = { from: 'me' | 'ai'; text: string; plan?: Plan; applied?: boolean };

export default function Assistant() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'ai', text: `Hola ${user?.name.split(' ')[0] ?? ''} 👋 Cuéntame cuánto recibes por semana y qué quieres priorizar, y te armo un plan de plata.` }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setText(''); setBusy(true);
    setMsgs((m) => [...m, { from: 'me', text: t }]);
    try {
      const p = await api.plan(t);
      setMsgs((m) => [...m, { from: 'ai', text: p.reply, plan: p }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: 'ai', text: e instanceof Error ? e.message : 'No pude armar el plan' }]);
    } finally { setBusy(false); }
  };
  const apply = async (i: number, p: Plan) => {
    await api.applyPlan(p);
    setMsgs((m) => m.map((x, k) => (k === i ? { ...x, applied: true } : x)).concat({ from: 'ai', text: '¡Hecho! Ya puse esos topes por sección. Los ves en Inicio y en Secciones.' }));
  };

  return (
    <Page>
      <Header kicker="Asistente IA" title="Tu plan de plata" />
      <div className="chat">
        {msgs.map((m, i) => m.from === 'me' ? <div key={i} className="bubble me">{m.text}</div> : (
          <div key={i} className="ai-row">
            <Mascot kind="chivo" size={34} />
            <div className="bubble ai">
              {m.text}
              {m.plan && (
                <div style={{ marginTop: 10 }}>
                  <div className="plan-bar">{m.plan.items.map((it) => <div key={it.category} style={{ width: `${it.pct}%`, background: CAT_COLOR[it.category] }} />)}</div>
                  {m.plan.items.map((it) => (
                    <div key={it.category} className="plan-row"><span><i className="dot" style={{ background: CAT_COLOR[it.category] }} />{it.label} {it.pct}%</span><b>{soles(it.amount, true)}</b></div>
                  ))}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn sm" style={{ flex: 1 }} disabled={m.applied} onClick={() => apply(i, m.plan!)}>{m.applied ? 'Aplicado ✓' : 'Aplicar plan'}</button>
                    <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => setText('Quiero ahorrar más')}>Ajustar</button>
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>{m.plan.footnote}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="muted">Pensando…</div>}
        <div ref={end} />
      </div>
      {msgs.length === 1 && (
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {['Priorizo comer y salidas, recibo S/ 60 semanales', 'Quiero ahorrar más', 'Priorizo transporte y suscripciones'].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escríbele a tu asistente" />
        <button className="send" type="submit" aria-label="Enviar">→</button>
      </form>
    </Page>
  );
}
