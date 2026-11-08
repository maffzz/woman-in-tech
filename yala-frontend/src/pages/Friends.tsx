import { useEffect, useState } from 'react';
import { api, type Loan, type Movement, type Outing, type SplitResult } from '../api/yala';
import { Progress } from '../components/Charts';
import { ErrorNote, Header, Loading, Page, Sheet, Toast } from '../components/Ui';
import { daysUntil, shortDate, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';

type Tab = 'salidas' | 'prestamos' | 'dividir';
const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;
const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

export default function Friends() {
  const [tab, setTab] = useState<Tab>('salidas');
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);
  return (
    <Page>
      <Header back kicker="Vida social" title="Amigos" />
      <div className="tabs">
        {([['salidas', 'Salidas'], ['prestamos', 'Préstamos'], ['dividir', 'Dividir']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'salidas' && <Outings toast={setToast} />}
      {tab === 'prestamos' && <Loans toast={setToast} />}
      {tab === 'dividir' && <Split toast={setToast} />}
      <Toast msg={toast} />
    </Page>
  );
}

function Outings({ toast }: { toast: (s: string) => void }) {
  const o = useApi(api.outings);
  const [sheet, setSheet] = useState<null | 'new' | Outing>(null);
  if (o.loading && !o.data) return <Loading />;
  if (o.error || !o.data) return <ErrorNote msg={o.error ?? 'Error'} retry={o.reload} />;
  return (
    <>
      <button className="btn block" onClick={() => setSheet('new')}>+ Nueva salida</button>
      <div style={{ height: 12 }} />
      {o.data.items.length === 0 && <div className="center-note">Aún no planeaste salidas. Ponle presupuesto a la próxima 🎉</div>}
      {o.data.items.map((x) => (
        <button key={x.id} className="card" style={{ display: 'block', width: '100%', textAlign: 'left', border: 0 }} onClick={() => setSheet(x)}>
          <div className="row between"><b>{x.name}</b><span className={'tag ' + (x.status === 'finished' ? (x.withinBudget ? 'ok' : 'late') : '')}>{x.status === 'open' ? 'En curso' : x.withinBudget ? 'Dentro del presupuesto' : 'Te pasaste un poco'}</span></div>
          <div className="muted" style={{ margin: '6px 0' }}>{soles(x.spent, true)} de {soles(x.budget, true)}</div>
          <Progress pct={x.progressPct} />
        </button>
      ))}
      {sheet === 'new' && <NewOuting onClose={() => setSheet(null)} onDone={() => { setSheet(null); o.reload(); toast('Salida creada'); }} />}
      {sheet && sheet !== 'new' && <OutingSheet o={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); o.reload(); }} />}
    </>
  );
}
function NewOuting({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [budget, setBudget] = useState('30');
  return (
    <Sheet title="Nueva salida" onClose={onClose}>
      <label className="field">¿Qué plan? <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cine con las chicas" /></label>
      <label className="field">Presupuesto (S/)<input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <button className="btn block" disabled={!name || !Number(budget)} onClick={async () => { await api.createOuting({ name, budget: Number(budget) }); onDone(); }}>Crear</button>
    </Sheet>
  );
}
function OutingSheet({ o, onClose, onDone }: { o: Outing; onClose: () => void; onDone: () => void }) {
  const recent = useApi(() => api.movements({ type: 'expense', limit: 12 }));
  const [cur, setCur] = useState(o);
  const inIds = new Set(cur.movements.map((m) => m.id));
  return (
    <Sheet title={cur.name} onClose={onClose}>
      <div className="muted">{soles(cur.spent, true)} de {soles(cur.budget, true)} · quedan {soles(Math.max(0, cur.remaining), true)}</div>
      <div style={{ margin: '8px 0 14px' }}><Progress pct={cur.progressPct} /></div>
      {cur.movements.map((m: Movement) => <div key={m.id} className="list-row"><span>{m.counterparty}</span><b>{soles(m.amount, true)}</b></div>)}
      {cur.status === 'open' && (
        <>
          <div className="section-title"><span>Suma tus gastos de hoy</span></div>
          {recent.data?.items.filter((m) => !inIds.has(m.id)).slice(0, 6).map((m) => (
            <button key={m.id} className="list-row" onClick={async () => setCur(await api.addToOuting(cur.id, m.id))}><span>＋ {m.counterparty}</span><b>{soles(m.amount, true)}</b></button>
          ))}
          <button className="btn dark block" style={{ marginTop: 12 }} onClick={async () => { await api.finishOuting(cur.id); onDone(); }}>Terminar salida</button>
        </>
      )}
    </Sheet>
  );
}

function Loans({ toast }: { toast: (s: string) => void }) {
  const { user } = useAuth();
  const l = useApi(api.loans);
  const s = useApi(api.loanSuggestions);
  const [sheet, setSheet] = useState<null | 'new' | { msg: string; link: string }>(null);
  const refresh = () => { l.reload(); s.reload(); };
  if (l.loading && !l.data) return <Loading />;
  if (l.error || !l.data) return <ErrorNote msg={l.error ?? 'Error'} retry={l.reload} />;
  const pending = l.data.items.filter((x) => x.status !== 'paid');
  const paid = l.data.items.filter((x) => x.status === 'paid').slice(0, 5);
  return (
    <>
      {s.data?.items.map((sg) => {
        const loan = l.data!.items.find((x) => x.id === sg.loanId);
        return loan && (
          <div key={sg.loanId} className="card lav" style={{ fontSize: 13 }}>
            {sg.reason}. ¿Es lo de {loan.friendNickname}?
            <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={async () => { await api.payLoan(loan.id, 'yape', sg.movement.id); refresh(); toast('¡Marcado como pagado!'); }}>Sí, marcar pagado</button></div>
          </div>
        );
      })}
      <button className="btn block" onClick={() => setSheet('new')}>+ Nuevo préstamo</button>
      <div className="section-title"><span>Pendientes</span></div>
      {pending.length === 0 && <div className="center-note">Todo al día ✨</div>}
      {pending.map((x) => <LoanCard key={x.id} x={x} demo={!!user?.isDemo} onChange={refresh} onMsg={(m, link) => setSheet({ msg: m, link })} toast={toast} />)}
      {paid.length > 0 && <div className="section-title"><span>Pagados</span></div>}
      {paid.map((x) => (
        <div key={x.id} className="card lav row between" style={{ fontSize: 13 }}><span>{x.friendNickname} · {soles(x.amount)}</span><span className={'tag ' + (x.onTime === false ? 'late' : 'ok')}>{x.onTime === false ? 'Pagado' : 'A tiempo ✓'}</span></div>
      ))}
      {sheet === 'new' && <NewLoan onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); toast('Préstamo guardado'); }} />}
      {sheet && sheet !== 'new' && (
        <Sheet title="Mensaje para cobrar" onClose={() => setSheet(null)}>
          <p style={{ background: 'var(--lav)', padding: 12, borderRadius: 14, fontSize: 14 }}>{sheet.msg}</p>
          <div className="row"><button className="btn" style={{ flex: 1 }} onClick={async () => toast((await copy(sheet.msg)) ? 'Copiado' : 'No pude copiar')}>Copiar</button><a className="btn ghost" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={wa(sheet.msg)} target="_blank" rel="noreferrer">WhatsApp</a></div>
        </Sheet>
      )}
    </>
  );
}
function LoanCard({ x, demo, onChange, onMsg, toast }: { x: Loan; demo: boolean; onChange: () => void; onMsg: (m: string, link: string) => void; toast: (s: string) => void }) {
  const d = daysUntil(x.dueDate);
  const lent = x.direction === 'lent';
  return (
    <div className="card">
      <div className="row between"><b>{lent ? `${x.friendNickname} te debe` : `Le debes a ${x.friendNickname}`}</b><b>{soles(x.amount, true)}</b></div>
      <div className="muted" style={{ margin: '4px 0 10px' }}>{x.concept ?? 'Préstamo'} · {x.status === 'overdue' ? `venció el ${shortDate(x.dueDate)}` : `vence en ${d} d`} {lent && <span className={'tag' + (x.confirmedByFriend ? ' ok' : '')}>{x.confirmedByFriend ? 'Confirmado' : 'Sin confirmar'}</span>}</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {lent && <button className="btn sm" onClick={async () => { const r = await api.remind(x.id); onMsg(r.message, r.link); onChange(); }}>Recordar con cariño</button>}
        <button className="btn ghost sm" onClick={async () => { await api.payLoan(x.id, 'cash'); onChange(); toast(lent ? 'Cobrado ✓' : 'Pagado ✓'); }}>{lent ? 'Me pagó' : 'Ya pagué'}</button>
        {lent && !x.confirmedByFriend && <button className="btn ghost sm" onClick={async () => { const ok = await copy(x.confirmLink); toast(ok ? 'Link copiado' : x.confirmLink); }}>Copiar link</button>}
        {demo && lent && !x.confirmedByFriend && <button className="btn ghost sm" onClick={async () => { await api.simulateConfirm(x.id); onChange(); }}>Simular confirmación</button>}
      </div>
    </div>
  );
}
function NewLoan({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [dir, setDir] = useState<'lent' | 'borrowed'>('lent'); const [nick, setNick] = useState(''); const [amount, setAmount] = useState(''); const [concept, setConcept] = useState('');
  return (
    <Sheet title="Nuevo préstamo" onClose={onClose}>
      <div className="tabs"><button className={dir === 'lent' ? 'active' : ''} onClick={() => setDir('lent')}>Presté</button><button className={dir === 'borrowed' ? 'active' : ''} onClick={() => setDir('borrowed')}>Me prestaron</button></div>
      <label className="field">Apodo de tu pana<input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Sofi" /></label>
      <label className="field">Monto (S/)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="field">Concepto<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Pizza" /></label>
      <p className="disclaimer">Solo guardamos el apodo, nunca su nombre completo.</p>
      <button className="btn block" disabled={!nick || !Number(amount)} onClick={async () => { await api.createLoan({ friendNickname: nick, amount: Number(amount), direction: dir, concept: concept || undefined }); onDone(); }}>Guardar</button>
    </Sheet>
  );
}

function Split({ toast }: { toast: (s: string) => void }) {
  const [total, setTotal] = useState(''); const [concept, setConcept] = useState(''); const [names, setNames] = useState('');
  const [mode, setMode] = useState<'equal' | 'custom'>('equal'); const [amts, setAmts] = useState<Record<string, string>>({});
  const [res, setRes] = useState<SplitResult | null>(null); const [err, setErr] = useState<string | null>(null);
  const people = names.split(',').map((s) => s.trim()).filter(Boolean);
  const go = async () => {
    setErr(null);
    try { setRes(await api.split({ total: Number(total), mode, concept: concept || undefined, people: people.map((n) => ({ nickname: n, amount: mode === 'custom' ? Number(amts[n] ?? 0) : undefined })) })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };
  if (res) return (
    <>
      <div className="card"><b>Tu parte: {soles(res.myShare, true)}</b><div className="muted">Total {soles(res.total, true)}. Creé los préstamos para que no se te olvide cobrarlos.</div></div>
      {res.shares.map((s) => (
        <div key={s.nickname} className="card"><div className="row between"><b>{s.nickname}</b><b>{soles(s.amount, true)}</b></div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={async () => toast((await copy(s.whatsappText)) ? 'Mensaje copiado' : 'No pude copiar')}>Copiar mensaje</button><a className="btn ghost sm" style={{ textDecoration: 'none' }} href={wa(s.whatsappText)} target="_blank" rel="noreferrer">WhatsApp</a></div></div>
      ))}
      <button className="btn ghost block" onClick={() => setRes(null)}>Dividir otra cuenta</button>
    </>
  );
  return (
    <>
      <div className="card">
        <label className="field">Total de la cuenta (S/)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        <label className="field">Concepto<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Pizza del sábado" /></label>
        <label className="field">Apodos (separados por coma) — yo pagué todo<input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Sofi, Mateo, Lucía" /></label>
        <div className="tabs"><button className={mode === 'equal' ? 'active' : ''} onClick={() => setMode('equal')}>En partes iguales</button><button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Cada uno su monto</button></div>
        {mode === 'custom' && people.map((n) => <label key={n} className="field">{n}<input inputMode="decimal" value={amts[n] ?? ''} onChange={(e) => setAmts({ ...amts, [n]: e.target.value })} /></label>)}
        {err && <div className="center-note err" style={{ padding: 6 }}>{err}</div>}
        <button className="btn block" disabled={!Number(total) || people.length === 0} onClick={go}>Calcular y crear cobros</button>
      </div>
    </>
  );
}
