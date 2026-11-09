import { useState } from 'react';
import { api, type Loan, type SplitResult } from '../api/yala';
import { ErrorNote, Header, Loading, Page, Sheet, Toast, CelebrationToast } from '../components/Ui';
import { daysUntil, shortDate, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';

const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;
const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

// ─── Pantalla principal: dos bloques ─────────────────────────────────────────
export default function Friends() {
  const [view, setView] = useState<null | 'prestamos' | 'dividir'>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (view === 'prestamos') return <LoansView onBack={() => setView(null)} toast={setToast} extra={<Toast msg={toast} />} />;
  if (view === 'dividir')   return <SplitView  onBack={() => setView(null)} toast={setToast} extra={<Toast msg={toast} />} />;

  return (
    <Page>
      <Header kicker="Vida social" title="Amigos" />
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <SectionBlock
          emoji="🤝"
          title="Préstamos"
          desc="Prestar, que te presten, y cobrar sin roche."
          color="var(--lav)"
          onClick={() => setView('prestamos')}
        />
        <SectionBlock
          emoji="➗"
          title="Dividir cuenta"
          desc="Divide la pizza, el taxi o lo que sea entre tus amigos."
          color="var(--cyan)"
          onClick={() => setView('dividir')}
        />
      </div>
      <Toast msg={toast} />
    </Page>
  );
}

function SectionBlock({ emoji, title, desc, color, onClick }: { emoji: string; title: string; desc: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 16, background: color, border: 'none', borderRadius: 22, padding: '20px 20px', cursor: 'pointer', textAlign: 'left', width: '100%', boxShadow: '0 2px 14px rgba(60,40,140,.08)' }}
    >
      <span style={{ fontSize: 36 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
    </button>
  );
}

// ─── Vista de Préstamos ───────────────────────────────────────────────────────
function LoansView({ onBack, toast, extra }: { onBack: () => void; toast: (s: string) => void; extra: React.ReactNode }) {
  const { user } = useAuth();
  const l = useApi(api.loans);
  const s = useApi(api.loanSuggestions);
  const [sheet, setSheet] = useState<null | 'new' | { msg: string; link: string }>(null);
  const refresh = () => { l.reload(); s.reload(); };

  if (l.loading && !l.data) return <Page><Header back title="Préstamos" /><Loading />{extra}</Page>;
  if (l.error || !l.data) return <Page><Header back title="Préstamos" /><ErrorNote msg={l.error ?? 'Error'} retry={l.reload} />{extra}</Page>;

  const pending = l.data.items.filter((x) => x.status !== 'paid');
  const paid = l.data.items.filter((x) => x.status === 'paid').slice(0, 5);

  return (
    <Page>
      <Header back title="Préstamos" right={<button className="pill" style={{ border: 0, background: 'var(--lav2)', color: 'var(--ink)' }} onClick={() => setSheet('new')}>+ Nuevo</button>} />

      {/* Sugerencias automáticas */}
      {s.data?.items.map((sg) => {
        const loan = l.data!.items.find((x) => x.id === sg.loanId);
        return loan && (
          <div key={sg.loanId} className="card lav" style={{ fontSize: 13 }}>
            {sg.reason}. ¿Es lo de {loan.friendNickname}?
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={async () => { await api.payLoan(loan.id, 'yape', sg.movement.id); refresh(); toast('¡Marcado como pagado!'); }}>Sí, marcar pagado</button>
            </div>
          </div>
        );
      })}

      <div className="section-title"><span>Pendientes</span></div>
      {pending.length === 0 && <div className="center-note">Todo al día ✨</div>}
      {pending.map((x) => <LoanCard key={x.id} x={x} demo={!!user?.isDemo} onChange={refresh} onMsg={(m, link) => setSheet({ msg: m, link })} toast={toast} />)}

      {paid.length > 0 && <><div className="section-title"><span>Pagados</span></div>
        {paid.map((x) => (
          <div key={x.id} className="card lav row between" style={{ fontSize: 13 }}>
            <span>{x.friendNickname} · {soles(x.amount)}</span>
            <span className={'tag ' + (x.onTime === false ? 'late' : 'ok')}>{x.onTime === false ? 'Tarde' : 'A tiempo ✓'}</span>
          </div>
        ))}
      </>}

      {sheet === 'new' && <NewLoan onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); toast('Préstamo guardado'); }} />}
      {sheet && sheet !== 'new' && (
        <Sheet title="Mensaje para cobrar" onClose={() => setSheet(null)}>
          <p style={{ background: 'var(--lav)', padding: 12, borderRadius: 14, fontSize: 14 }}>{sheet.msg}</p>
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={async () => toast((await copy(sheet.msg)) ? 'Copiado' : 'No pude copiar')}>Copiar</button>
            <a className="btn ghost" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={wa(sheet.msg)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </Sheet>
      )}
      {extra}
    </Page>
  );
}

function LoanCard({ x, demo, onChange, onMsg, toast }: { x: Loan; demo: boolean; onChange: () => void; onMsg: (m: string, link: string) => void; toast: (s: string) => void }) {
  const d = daysUntil(x.dueDate);
  const lent = x.direction === 'lent';
  return (
    <div className="card">
      <div className="row between">
        <b>{lent ? `${x.friendNickname} te debe` : `Le debes a ${x.friendNickname}`}</b>
        <b>{soles(x.amount, true)}</b>
      </div>
      <div className="muted" style={{ margin: '4px 0 10px' }}>
        {x.concept ?? 'Préstamo'} · {x.status === 'overdue' ? `venció el ${shortDate(x.dueDate)}` : `vence en ${d} d`}
        {lent && <span className={'tag' + (x.confirmedByFriend ? ' ok' : '')} style={{ marginLeft: 8 }}>{x.confirmedByFriend ? 'Confirmado' : 'Sin confirmar'}</span>}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {lent && <button className="btn sm" onClick={async () => { const r = await api.remind(x.id); onMsg(r.message, r.link); onChange(); }}>Recordar con cariño</button>}
        <button className="btn ghost sm" onClick={async () => {
          const paid = await api.payLoan(x.id, 'cash');
          onChange();
          if (paid.onTime) toast('🎉 ¡Pagado a tiempo! Sumas puntos en tu perfil');
          else toast(lent ? 'Cobrado ✓' : 'Pagado ✓');
        }}>{lent ? 'Me pagó' : 'Ya pagué'}</button>
        {lent && !x.confirmedByFriend && <button className="btn ghost sm" onClick={async () => { const ok = await copy(x.confirmLink); toast(ok ? 'Link copiado' : x.confirmLink); }}>Copiar link</button>}
        {demo && lent && !x.confirmedByFriend && <button className="btn ghost sm" onClick={async () => { await api.simulateConfirm(x.id); onChange(); }}>Simular confirmación</button>}
      </div>
    </div>
  );
}

function NewLoan({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [dir, setDir] = useState<'lent' | 'borrowed'>('lent');
  const [nick, setNick] = useState('');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  return (
    <Sheet title="Nuevo préstamo" onClose={onClose}>
      <div className="tabs">
        <button className={dir === 'lent' ? 'active' : ''} onClick={() => setDir('lent')}>Presté</button>
        <button className={dir === 'borrowed' ? 'active' : ''} onClick={() => setDir('borrowed')}>Me prestaron</button>
      </div>
      <label className="field">Apodo de tu pana<input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Sofi" autoFocus /></label>
      <label className="field">Monto (S/)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="field">Concepto<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Pizza" /></label>
      <label className="field">¿Para cuándo?<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} /></label>
      <p className="disclaimer">Solo guardamos el apodo, nunca su nombre completo.</p>
      <button className="btn block" disabled={!nick || !Number(amount)} onClick={async () => {
        await api.createLoan({ friendNickname: nick, amount: Number(amount), direction: dir, concept: concept || undefined, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined });
        onDone();
      }}>Guardar</button>
    </Sheet>
  );
}

// ─── Vista de Dividir ─────────────────────────────────────────────────────────
function SplitView({ onBack, toast, extra }: { onBack: () => void; toast: (s: string) => void; extra: React.ReactNode }) {
  const [total, setTotal] = useState('');
  const [concept, setConcept] = useState('');
  const [names, setNames] = useState('');
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [amts, setAmts] = useState<Record<string, string>>({});
  const [res, setRes] = useState<SplitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const people = names.split(',').map((s) => s.trim()).filter(Boolean);

  const go = async () => {
    setErr(null);
    try {
      setRes(await api.split({ total: Number(total), mode, concept: concept || undefined, people: people.map((n) => ({ nickname: n, amount: mode === 'custom' ? Number(amts[n] ?? 0) : undefined })) }));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };

  if (res) return (
    <Page>
      <Header back title="Resultado" />
      <div className="card"><b>Tu parte: {soles(res.myShare, true)}</b><div className="muted">Total {soles(res.total, true)}. Creé los cobros para que no se te olvide.</div></div>
      {res.shares.map((s) => (
        <div key={s.nickname} className="card">
          <div className="row between"><b>{s.nickname}</b><b>{soles(s.amount, true)}</b></div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={async () => toast((await copy(s.whatsappText)) ? 'Mensaje copiado' : 'No pude copiar')}>Copiar mensaje</button>
            <a className="btn ghost sm" style={{ textDecoration: 'none' }} href={wa(s.whatsappText)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
      ))}
      <button className="btn ghost block" onClick={() => setRes(null)}>Dividir otra cuenta</button>
      {extra}
    </Page>
  );

  return (
    <Page>
      <Header back title="Dividir cuenta" />
      <div className="card">
        <label className="field">Total de la cuenta (S/)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} autoFocus /></label>
        <label className="field">Concepto<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Pizza del sábado" /></label>
        <label className="field">Apodos separados por coma (yo pagué todo)<input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Sofi, Mateo, Lucía" /></label>
        <div className="tabs">
          <button className={mode === 'equal' ? 'active' : ''} onClick={() => setMode('equal')}>En partes iguales</button>
          <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Cada uno su monto</button>
        </div>
        {mode === 'custom' && people.map((n) => (
          <label key={n} className="field">{n}<input inputMode="decimal" value={amts[n] ?? ''} onChange={(e) => setAmts({ ...amts, [n]: e.target.value })} /></label>
        ))}
        {err && <div className="center-note err" style={{ padding: 6 }}>{err}</div>}
        <button className="btn block" disabled={!Number(total) || people.length === 0} onClick={go}>Calcular y crear cobros</button>
      </div>
      {extra}
    </Page>
  );
}
