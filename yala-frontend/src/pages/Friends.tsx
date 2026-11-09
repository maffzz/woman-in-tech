import { useState } from 'react';
import { api, type FriendActivity, type Loan, type SplitResult } from '../api/yala';
import { ErrorNote, Header, Loading, Page, Sheet, Toast, CelebrationToast } from '../components/Ui';
import { Mascot, type MascotKey } from '../components/Mascot';
import { daysUntil, shortDate, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';

const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;
const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

// ─── Pantalla principal: bloques ──────────────────────────────────────────────
export default function Friends() {
  const [view, setView] = useState<null | 'actividad' | 'prestamos' | 'dividir'>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (view === 'actividad') return <FriendActivityView onBack={() => setView(null)} toast={setToast} extra={<Toast msg={toast} />} />;
  if (view === 'prestamos') return <LoansView onBack={() => setView(null)} toast={setToast} extra={<Toast msg={toast} />} />;
  if (view === 'dividir')   return <SplitView  onBack={() => setView(null)} toast={setToast} extra={<Toast msg={toast} />} />;

  return (
    <Page>
      <Header kicker="Vida social" title="Amigos 🤝" />
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <SectionBlock
          emoji="👀"
          title="Ver a tus panas"
          desc="Mira en qué nivel están y si alguno está migajeando."
          color="var(--lav2)"
          onClick={() => setView('actividad')}
        />
        <SectionBlock
          emoji="💸"
          title="Deudas & cobros"
          desc="Prestar, que te presten, y cobrar sin drama."
          color="var(--lav)"
          onClick={() => setView('prestamos')}
        />
        <SectionBlock
          emoji="➗"
          title="Dividir la cuenta"
          desc="Parte la pizza, el taxi o lo que sea. Justo y sin roche."
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
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 16, background: color,
      border: 'none', borderRadius: 22, padding: '20px', cursor: 'pointer',
      textAlign: 'left', width: '100%', boxShadow: '0 2px 14px rgba(60,40,140,.08)',
    }}>
      <span style={{ fontSize: 36 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
    </button>
  );
}

// ─── Vista de actividad de amigos ─────────────────────────────────────────────
function FriendActivityView({ onBack, toast, extra }: { onBack: () => void; toast: (s: string) => void; extra: React.ReactNode }) {
  const { user } = useAuth();
  const f = useApi(api.friendsActivity);
  const [donateFor, setDonateFor] = useState<FriendActivity | null>(null);
  const [celebrateMsg, setCelebrate] = useState<string | null>(null);

  if (f.loading && !f.data) return <Page><Header back title="Tus panas" /><Loading />{extra}</Page>;

  const items = f.data?.items ?? [];

  return (
    <Page>
      <Header back title="Tus panas 👀" />

      {items.length === 0 && (
        <div className="center-note" style={{ padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤷</div>
          <b>Aún no tienes panas en Yala</b>
          <p className="muted" style={{ marginTop: 8 }}>Comparte el link de invitación para conectarte con tus amigos.</p>
          <button className="btn block" style={{ marginTop: 16 }} onClick={async () => {
            try {
              const r = await api.friendInviteLink();
              await copy(r.link);
              toast('Link copiado. ¡Compártelo con tus panas! 🎉');
            } catch { toast('No se pudo generar el link'); }
          }}>
            Copiar link de invitación
          </button>
        </div>
      )}

      {items.map((friend) => (
        <div key={friend.friendshipId} style={{
          background: friend.isMigajeando ? '#fff3e0' : '#fff',
          border: friend.isMigajeando ? '2px solid #f59e0b' : '2px solid var(--lav2)',
          borderRadius: 20, padding: '14px 16px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Mascota del nivel del amigo */}
            <div style={{
              background: 'var(--lav)', borderRadius: '50%', width: 52, height: 52,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Mascot kind={friend.levelKey as MascotKey} size={40} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{friend.nickname}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {friend.levelName} · {friend.streakWeeks} sem de racha
              </div>
              {/* Barra de presupuesto semanal */}
              <div style={{ marginTop: 6, height: 5, background: 'var(--lav2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99, transition: 'width .5s',
                  width: `${Math.min(100, friend.weekPct)}%`,
                  background: friend.weekPct >= 100 ? '#f59e0b' : friend.weekPct >= 80 ? '#fb923c' : 'var(--teal)',
                }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {friend.weekPct}% de su semana
              </div>
            </div>
          </div>

          {/* Alerta migajeando */}
          {friend.isMigajeando && (
            <div style={{ marginTop: 10, background: '#fff3e0', borderRadius: 12, padding: '8px 12px', fontSize: 13 }}>
              <b style={{ color: '#92400e' }}>😬 {friend.nickname} está migajeando</b>
              <div style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
                Se pasó en: {friend.migajeandoIn}
              </div>
              <button
                className="btn sm"
                style={{ marginTop: 8, background: '#f59e0b', color: '#fff', border: 0 }}
                onClick={() => setDonateFor(friend)}
              >
                Mándale migajas 🪙
              </button>
            </div>
          )}
        </div>
      ))}

      {donateFor && (
        <DonateSheet
          friend={donateFor}
          onClose={() => setDonateFor(null)}
          onDone={(msg) => { setDonateFor(null); setCelebrate(msg); f.reload(); }}
        />
      )}
      <CelebrationToast msg={celebrateMsg} onDone={() => setCelebrate(null)} />
      {extra}
    </Page>
  );
}

function DonateSheet({ friend, onClose, onDone }: { friend: FriendActivity; onClose: () => void; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState<number>(0.1);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const AMOUNTS = [
    { value: 0.1, label: 'S/ 0.10', emoji: '🪙' },
    { value: 0.2, label: 'S/ 0.20', emoji: '💰' },
    { value: 0.5, label: 'S/ 0.50', emoji: '🤑' },
    { value: 1.0, label: 'S/ 1.00', emoji: '💸' },
  ];

  return (
    <Sheet title={`Mándale migajas a ${friend.nickname} 🪙`} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
        Un apoyo simbólico para hacerle saber que lo tienes presente. Sin drama, solo buena vibra. 😌
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {AMOUNTS.map((a) => (
          <button
            key={a.value}
            onClick={() => setAmount(a.value)}
            style={{
              background: amount === a.value ? 'var(--teal)' : 'var(--lav)',
              border: 0, borderRadius: 14, padding: '12px 8px', fontSize: 14,
              fontWeight: amount === a.value ? 700 : 500, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ fontSize: 24 }}>{a.emoji}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <label className="field">
        Mensaje (opcional)
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="ánimo pana, ya la recuperas 💪" maxLength={80} />
      </label>
      <button className="btn block" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await api.friendDonate(friend.friendshipId, amount, msg || undefined);
          onDone(r.message);
        } catch { onDone('¡Migajas enviadas! 🪙'); }
      }}>
        Mandar migajas ✨
      </button>
    </Sheet>
  );
}

// ─── Vista de Deudas & cobros ─────────────────────────────────────────────────
function LoansView({ onBack, toast, extra }: { onBack: () => void; toast: (s: string) => void; extra: React.ReactNode }) {
  const { user } = useAuth();
  const l = useApi(api.loans);
  const s = useApi(api.loanSuggestions);
  const [sheet, setSheet] = useState<null | 'new' | { msg: string; link: string } | { loanId: number }>(null);
  const refresh = () => { l.reload(); s.reload(); };

  if (l.loading && !l.data) return <Page><Header back title="Deudas 💸" /><Loading />{extra}</Page>;
  if (l.error || !l.data) return <Page><Header back title="Deudas 💸" /><ErrorNote msg={l.error ?? 'Error'} retry={l.reload} />{extra}</Page>;

  const pending = l.data.items.filter((x) => x.status !== 'paid');
  const paid = l.data.items.filter((x) => x.status === 'paid').slice(0, 5);

  return (
    <Page>
      <Header back title="Deudas 💸" right={<button className="pill" style={{ border: 0, background: 'var(--lav2)', color: 'var(--ink)' }} onClick={() => setSheet('new')}>+ Nueva</button>} />

      {/* Sugerencias automáticas */}
      {s.data?.items.map((sg) => {
        const loan = l.data!.items.find((x) => x.id === sg.loanId);
        return loan && (
          <div key={sg.loanId} className="card lav" style={{ fontSize: 13 }}>
            {sg.reason}. ¿Es lo de {loan.friendNickname}?
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={async () => { await api.payLoan(loan.id, 'yape', sg.movement.id); refresh(); toast('¡YALA! Marcado como pagado 🎉'); }}>
                ¡Sí, YALA! ✅
              </button>
            </div>
          </div>
        );
      })}

      <div className="section-title"><span>Pendientes</span></div>
      {pending.length === 0 && <div className="center-note">Todo al día ✨<br /><span className="muted">Sin dramas financieros por ahora.</span></div>}
      {pending.map((x) => (
        <LoanCard key={x.id} x={x} demo={!!user?.isDemo} onChange={refresh}
          onMsg={(m, link) => setSheet({ msg: m, link })}
          onRemind={(loanId) => setSheet({ loanId })}
          toast={toast}
        />
      ))}

      {paid.length > 0 && (
        <>
          <div className="section-title"><span>YALA'd ✅</span></div>
          {paid.map((x) => (
            <div key={x.id} className="card lav row between" style={{ fontSize: 13 }}>
              <span>{x.friendNickname} · {soles(x.amount)}</span>
              <span className={'tag ' + (x.onTime === false ? 'late' : 'ok')}>
                {x.onTime === false ? 'Un poco tarde' : 'A tiempo 🔥'}
              </span>
            </div>
          ))}
        </>
      )}

      {sheet === 'new' && <NewLoan onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); toast('Deuda guardada 📝'); }} />}
      {sheet && typeof sheet === 'object' && 'msg' in sheet && (
        <Sheet title="Mensaje listo pa copiar" onClose={() => setSheet(null)}>
          <p style={{ background: 'var(--lav)', padding: 12, borderRadius: 14, fontSize: 14, lineHeight: 1.6 }}>{(sheet as { msg: string }).msg}</p>
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={async () => toast((await copy((sheet as { msg: string }).msg)) ? 'Copiado ✓' : 'No pude copiar')}>Copiar</button>
            <a className="btn ghost" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={wa((sheet as { msg: string }).msg)} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </Sheet>
      )}
      {sheet && typeof sheet === 'object' && 'loanId' in sheet && (
        <RemindLevelSheet
          loanId={(sheet as { loanId: number }).loanId}
          onClose={() => setSheet(null)}
          onDone={(msg, link) => { setSheet({ msg, link }); refresh(); }}
        />
      )}
      {extra}
    </Page>
  );
}

function RemindLevelSheet({ loanId, onClose, onDone }: { loanId: number; onClose: () => void; onDone: (msg: string, link: string) => void }) {
  const [busy, setBusy] = useState(false);
  const LEVELS = [
    { level: 0 as const, emoji: '😤', label: 'Cero cariño', desc: 'Directo al punto, sin rodeos.' },
    { level: 1 as const, emoji: '😊', label: 'Con cariño',  desc: 'Amable pero que se note que esperas pago.' },
    { level: 2 as const, emoji: '🥺', label: 'Mucho cariño', desc: 'Súper suave, casi da pena cobrar.' },
  ];
  return (
    <Sheet title="¿Con cuánto cariño cobras? 💌" onClose={onClose}>
      <div style={{ display: 'grid', gap: 8 }}>
        {LEVELS.map(({ level, emoji, label, desc }) => (
          <button key={level} disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await api.remind(loanId, level);
            onDone(r.message, r.link);
          }} style={{
            display: 'flex', alignItems: 'center', gap: 14, background: 'var(--lav)',
            border: 0, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontSize: 32, flexShrink: 0 }}>{emoji}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function LoanCard({ x, demo, onChange, onMsg, onRemind, toast }: {
  x: Loan; demo: boolean; onChange: () => void;
  onMsg: (m: string, link: string) => void;
  onRemind: (loanId: number) => void;
  toast: (s: string) => void;
}) {
  const d = daysUntil(x.dueDate);
  const lent = x.direction === 'lent';
  const isOverdue = x.status === 'overdue';
  return (
    <div className="card" style={{ borderLeft: isOverdue ? '4px solid #f59e0b' : undefined }}>
      <div className="row between">
        <b>{lent ? `${x.friendNickname} te debe` : `Le debes a ${x.friendNickname}`}</b>
        <b>{soles(x.amount, true)}</b>
      </div>
      <div className="muted" style={{ margin: '4px 0 10px' }}>
        {x.concept ?? 'Préstamo'} · {isOverdue ? `😬 venció el ${shortDate(x.dueDate)}` : `vence en ${d} día${d !== 1 ? 's' : ''}`}
        {lent && (
          <span className={'tag' + (x.confirmedByFriend ? ' ok' : '')} style={{ marginLeft: 8 }}>
            {x.confirmedByFriend ? 'Confirmado ✓' : 'Sin confirmar aún'}
          </span>
        )}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {lent && (
          <button className="btn sm" onClick={() => onRemind(x.id)}>
            Cobrar 💌
          </button>
        )}
        <button className="btn ghost sm" onClick={async () => {
          const paid = await api.payLoan(x.id, 'cash');
          onChange();
          if (paid.onTime) toast('🎉 ¡YALA! Pagado a tiempo. Sumas puntos.');
          else toast(lent ? '¡YALA! Cobrado 💰' : '¡YALA! Pagado ✅');
        }}>
          {lent ? '¡YALA! Me pagó' : '¡YALA! Ya pagué'}
        </button>
        {lent && !x.confirmedByFriend && (
          <button className="btn ghost sm" onClick={async () => {
            const ok = await copy(x.confirmLink);
            toast(ok ? 'Link copiado pa tu pana 🔗' : x.confirmLink);
          }}>
            Copiar link
          </button>
        )}
        {demo && lent && !x.confirmedByFriend && (
          <button className="btn ghost sm" onClick={async () => { await api.simulateConfirm(x.id); onChange(); toast('Simulado: tu pana confirmó ✓'); }}>
            Simular confirmación
          </button>
        )}
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
    <Sheet title="Nueva deuda 📝" onClose={onClose}>
      <div className="tabs">
        <button className={dir === 'lent' ? 'active' : ''} onClick={() => setDir('lent')}>Presté</button>
        <button className={dir === 'borrowed' ? 'active' : ''} onClick={() => setDir('borrowed')}>Me prestaron</button>
      </div>
      <label className="field">Apodo de tu pana<input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Sofi" autoFocus /></label>
      <label className="field">Monto (S/)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="field">¿De qué fue?<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="la pizza del sábado" /></label>
      <label className="field">¿Para cuándo?<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} /></label>
      <p className="disclaimer">Solo guardamos el apodo, nunca su nombre completo ni datos personales.</p>
      <button className="btn block" disabled={!nick || !Number(amount)} onClick={async () => {
        await api.createLoan({ friendNickname: nick, amount: Number(amount), direction: dir, concept: concept || undefined, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined });
        onDone();
      }}>Guardar deuda</button>
    </Sheet>
  );
}

// ─── Vista de Dividir cuenta ──────────────────────────────────────────────────
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
      <Header back title="¡Listo! 🎉" />
      <div className="card">
        <b>Tu parte: {soles(res.myShare, true)}</b>
        <div className="muted" style={{ marginTop: 4 }}>Total {soles(res.total, true)}. Creé los cobros pa que no se te olvide.</div>
      </div>
      {res.shares.map((s) => (
        <div key={s.nickname} className="card">
          <div className="row between"><b>{s.nickname}</b><b>{soles(s.amount, true)}</b></div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={async () => toast((await copy(s.whatsappText)) ? 'Mensaje copiado 📋' : 'No pude copiar')}>Copiar mensaje</button>
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
      <Header back title="Dividir cuenta ➗" />
      <div className="card">
        <label className="field">Total de la cuenta (S/)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} autoFocus /></label>
        <label className="field">¿Qué fue?<input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="la pizza del sábado" /></label>
        <label className="field">Apodos separados por coma (yo pagué todo)<input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Sofi, Mateo, Lucía" /></label>
        <div className="tabs">
          <button className={mode === 'equal' ? 'active' : ''} onClick={() => setMode('equal')}>En partes iguales</button>
          <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Cada quien lo suyo</button>
        </div>
        {mode === 'custom' && people.map((n) => (
          <label key={n} className="field">{n}<input inputMode="decimal" value={amts[n] ?? ''} onChange={(e) => setAmts({ ...amts, [n]: e.target.value })} /></label>
        ))}
        {err && <div className="center-note err" style={{ padding: 6 }}>{err}</div>}
        <button className="btn block" disabled={!Number(total) || people.length === 0} onClick={go}>Calcular y crear cobros ✨</button>
      </div>
      {extra}
    </Page>
  );
}
