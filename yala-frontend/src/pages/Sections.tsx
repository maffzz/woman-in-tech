import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type BudgetRow, type Category, type Movement, type Outing } from '../api/yala';
import { Donut, Progress } from '../components/Charts';
import { Mascot } from '../components/Mascot';
import { CelebrationToast, ErrorNote, Header, Loading, OverBudgetAlert, Page, Sheet, Toast } from '../components/Ui';
import { CAT_LABEL, soles } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';

const ORDER: Category[] = ['comida', 'transporte', 'salidas', 'suscripciones', 'juegos', 'recargas', 'entretenimiento', 'otros'];
const CAT_COLOR: Record<string, string> = {
  comida: '#5fe8d8', transporte: '#8fd3f7', salidas: '#e4a8f0', suscripciones: '#8f7bf0',
  juegos: '#a9e4ff', recargas: '#9ad9cf', entretenimiento: '#b7a9f7', otros: '#cfcde6',
};

// ─── Vista principal: lista de rectángulos ───────────────────────────────────
export default function Sections() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const cat = sp.get('c') as Category | null;
  const manage = sp.get('manage') === '1';
  const b = useApi(api.budgets);
  const cats = useApi(api.categories);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  // Gestión de categorías: no necesita budgets
  if (manage) return <ManageCategories onBack={() => nav('/secciones')} />;

  if (b.loading && !b.data) return <Page><Loading /></Page>;
  if (b.error || !b.data) return <Page><ErrorNote msg={b.error ?? 'Error'} retry={b.reload} /></Page>;

  // Si hay ?c=categoria, mostrar detalle
  if (cat) return <CategoryDetail cat={cat} onBack={() => nav('/secciones')} onToast={setToast} budgets={b} />;

  // Categorías activas (del backend, respetando personalizaciones)
  const activeCats = cats.data?.items.filter((c) => c.key !== 'ahorro') ?? ORDER.map((k) => ({ key: k, label: CAT_LABEL[k] ?? k, emoji: '🏷️', isSystem: true, hidden: false, sort_order: 99 }));

  // Vista principal: solo categorías como rectángulos (salidas ya está dentro del detalle de Salidas)
  return (
    <Page>
      <Header kicker="Tu dinero" title="Secciones" />

      {/* Lista de categorías */}
      <div className="section-title">
        <span>Por categoría</span>
        <button style={{ background: 'none', border: 0, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }} onClick={() => nav('/secciones?manage=1')}>
          ✏️ Personalizar
        </button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {activeCats.map((c) => {
          const row = b.data!.items.find((i) => i.category === c.key);
          const spent = row?.spent ?? 0;
          const cap = row?.weeklyCap ?? null;
          const pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : null;
          const color = CAT_COLOR[c.key] ?? '#cfcde6';
          return (
            <button
              key={c.key}
              onClick={() => nav(`/secciones?c=${c.key}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: 'none', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 14px rgba(60,40,140,.08)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <svg viewBox="0 0 52 52" width={52} height={52}>
                  <circle cx="26" cy="26" r="21" fill="none" stroke="var(--lav2)" strokeWidth="5" />
                  {pct !== null && (
                    <circle cx="26" cy="26" r="21" fill="none" stroke={color} strokeWidth="5"
                      strokeDasharray={`${(pct / 100) * 131.9} 131.9`} strokeLinecap="round"
                      transform="rotate(-90 26 26)" style={{ transition: 'stroke-dasharray .5s' }}
                    />
                  )}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink)' }}>
                  {pct !== null ? `${pct}%` : '—'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  {c.emoji !== '🏷️' ? `${c.emoji} ` : ''}{c.label}
                  {c.key === 'salidas' && <span style={{ fontSize: 11, color: 'var(--purple)', marginLeft: 6, fontWeight: 600 }}></span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {soles(spent, true)}{cap ? ` de ${soles(cap, true)}` : ' · sin tope'}
                </div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
      <Toast msg={toast} />
    </Page>
  );
}

function NewOuting({ onClose, onDone, suggestedBudget }: { onClose: () => void; onDone: () => void; suggestedBudget?: number }) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState(String(suggestedBudget ?? 30));
  return (
    <Sheet title="Nueva salida" onClose={onClose}>
      {suggestedBudget && (
        <div style={{ background: 'var(--mint)', borderRadius: 12, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          Tienes S/ {suggestedBudget} disponibles para salidas esta semana.
        </div>
      )}
      <label className="field">¿Qué plan?<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cine con las chicas" autoFocus /></label>
      <label className="field">Presupuesto para esta salida (S/)<input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <button className="btn block" disabled={!name || !Number(budget)} onClick={async () => { await api.createOuting({ name, budget: Number(budget) }); onDone(); }}>Crear salida</button>
    </Sheet>
  );
}

function OutingSheet({ o, demo, onClose, onDone }: { o: Outing; demo: boolean; onClose: () => void; onDone: () => void }) {
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
            <button key={m.id} className="list-row" onClick={async () => setCur(await api.addToOuting(cur.id, m.id))}>
              <span>＋ {m.counterparty}</span><b>{soles(m.amount, true)}</b>
            </button>
          ))}
          <button className="btn dark block" style={{ marginTop: 12 }} onClick={async () => { await api.finishOuting(cur.id); onDone(); }}>Terminar salida</button>
        </>
      )}
    </Sheet>
  );
}

// ─── Detalle de una categoría ─────────────────────────────────────────────────
function CategoryDetail({ cat, onBack, onToast, budgets }: { cat: Category; onBack: () => void; onToast: (s: string) => void; budgets: { data: import('../api/yala').Budgets | null; reload: () => void } }) {
  const mv = useApi(() => api.movements({ category: cat, type: 'expense', limit: 50 }), [cat]);
  const [showDetail, setShowDetail] = useState(false);
  const [sheet, setSheet] = useState<null | 'add' | 'cap' | 'extra' | 'newOuting' | { move: Movement } | Outing>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [overAlert, setOverAlert] = useState<string | null>(null);
  const { user } = useAuth();

  if (!budgets.data) return <Page><Loading /></Page>;
  const row: BudgetRow = budgets.data!.items.find((i) => i.category === cat) ?? { category: cat, label: CAT_LABEL[cat], weeklyCap: null, spent: 0, remaining: null, pct: null, today: 0, hormiga: 0, level: 'none' };

  const refresh = () => { budgets.reload(); mv.reload(); };
  const msg = row.weeklyCap === null ? 'Aún no tienes tope aquí. Ponle uno y te voy avisando.'
    : row.level === 'over' ? 'Te pasaste un poco, no pasa nada. Ajustamos la próxima semana.'
    : row.level === 'warn' ? `Ojo, vas cerca del tope. Te quedan ${soles(row.remaining ?? 0)}.`
    : `Vas bien. Te quedan ${soles(row.remaining ?? 0)} para lo que falta de la semana.`;

  const isSalidas = cat === 'salidas';

  return (
    <Page>
      <Header back title={isSalidas ? '🎉 Salidas' : CAT_LABEL[cat]}
        right={<button className="pill" style={{ border: 0, background: 'var(--lav2)', color: 'var(--ink)' }} onClick={() => setSheet('add')}>+ Gasto</button>}
      />

      {/* Donut + botones */}
      <div className="card">
        <Donut value={row.spent} max={row.weeklyCap} tone={row.level} size={190}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{soles(row.spent, true)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{row.weeklyCap === null ? 'sin tope' : `de ${soles(row.weeklyCap, true)} · ${row.pct}%`}</div>
          </div>
        </Donut>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => setSheet('add')}>+ Añadir gasto</button>
          {isSalidas
            ? <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSheet('extra')}>💰 Recibí plata extra</button>
            : <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSheet('cap')}>Ajustar tope</button>
          }
        </div>
        {!isSalidas && <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost block" style={{ fontSize: 12 }} onClick={() => setSheet('cap')}>⚙️ Cambiar tope semanal</button>
        </div>}
        <div className="say"><Mascot kind="pollito" size={34} /><span>{msg}</span></div>
      </div>

      {/* Tiles resumen */}
      <div className="tiles">
        <div className="tile hoy">Hoy<b>{soles(row.today, true)}</b></div>
        <div className={'tile quedan ' + row.level}>Quedan<b>{row.remaining === null ? '—' : soles(Math.max(0, row.remaining), true)}</b></div>
        <div className="tile hormiga">Hormiga<b>{soles(row.hormiga, true)}</b></div>
      </div>

      {/* ── Bloque especial para Salidas ── */}
      {isSalidas && <OutingsInCategory budgets={budgets} onToast={onToast} onBudgetChange={refresh} />}

      {/* Lista plegable de gastos */}
      <div className="section-title"><span>Gastos registrados</span></div>
      <div className="card lav">
        {mv.data?.items.length === 0 && <div className="muted" style={{ textAlign: 'center' }}>Sin gastos en esta sección todavía.</div>}
        {mv.data && mv.data.items.length > 0 && (
          <>
            {mv.data.items.slice(0, 3).map((m) => (
              <MovementRow key={m.id} m={m} onTap={() => setSheet({ move: m })} onDeleted={refresh} />
            ))}
            {mv.data.items.length > 3 && (
              <>
                {showDetail && mv.data.items.slice(3).map((m) => (
                  <MovementRow key={m.id} m={m} onTap={() => setSheet({ move: m })} onDeleted={refresh} />
                ))}
                <button style={{ width: '100%', background: 'none', border: 0, color: 'var(--purple)', fontWeight: 600, fontSize: 13, padding: '10px 0 4px', cursor: 'pointer' }} onClick={() => setShowDetail(!showDetail)}>
                  {showDetail ? '▲ Ocultar' : `▼ Ver los ${mv.data.items.length - 3} anteriores`}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Sheets */}
      {sheet === 'add' && <AddExpense cat={cat} onClose={() => setSheet(null)} onDone={(newRow) => {
        setSheet(null); refresh();
        if (newRow && row.weeklyCap !== null) {
          const newSpent = row.spent + newRow.amount;
          if (newSpent <= row.weeklyCap) setCelebrate(`✨ Dentro del presupuesto de ${row.label}. ¡Así se hace!`);
          else setOverAlert(`⚠️ Te pasaste del tope de ${row.label} por S/ ${(newSpent - row.weeklyCap).toFixed(0)}`);
        } else { onToast('Gasto guardado'); }
      }} />}
      {sheet === 'cap' && <CapSheet row={row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); onToast('Tope actualizado'); }} />}
      {sheet === 'extra' && <ExtraMoneySheet row={row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); onToast('Tope actualizado'); }} />}
      {sheet && typeof sheet === 'object' && 'move' in sheet && <MoveSheet m={(sheet as { move: Movement }).move} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); onToast('Listo'); }} />}
      <CelebrationToast msg={celebrate} onDone={() => setCelebrate(null)} />
      <OverBudgetAlert msg={overAlert} onDone={() => setOverAlert(null)} />
    </Page>
  );
}

// ─── Bloque de salidas dentro del detalle de Salidas ─────────────────────────
function OutingsInCategory({ budgets, onToast, onBudgetChange }: { budgets: { data: import('../api/yala').Budgets | null; reload: () => void }; onToast: (s: string) => void; onBudgetChange: () => void }) {
  const o = useApi(api.outings);
  const { user } = useAuth();
  const [sheet, setSheet] = useState<null | 'new' | Outing>(null);
  if (!o.data) return <Loading />;

  const open = o.data.items.filter((x) => x.status === 'open');
  const finished = o.data.items.filter((x) => x.status === 'finished').slice(0, 3);
  const capSalidas = budgets.data?.items.find((i) => i.category === 'salidas')?.weeklyCap ?? null;

  const reloadAll = () => { o.reload(); onBudgetChange(); };

  return (
    <>
      <div className="section-title">
        <span>Mis salidas</span>
        <button style={{ background: 'none', border: 0, color: 'var(--purple)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }} onClick={() => setSheet('new')}>
          + Nueva salida
        </button>
      </div>

      {open.length === 0 && finished.length === 0 && (
        <button
          onClick={() => setSheet('new')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--lav)', border: '2px dashed var(--lav2)', borderRadius: 18, padding: '16px', width: '100%', cursor: 'pointer', marginBottom: 10 }}
        >
          <span style={{ fontSize: 28 }}>🎉</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Crear una salida</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {capSalidas ? `Tienes S/ ${capSalidas} disponibles para salidas esta semana` : 'Pon un presupuesto y Yala te avisa si te pasas'}
            </div>
          </div>
        </button>
      )}

      {[...open, ...finished].map((x) => (
        <button key={x.id}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: 'none', borderRadius: 18, padding: '12px 16px', boxShadow: '0 2px 14px rgba(60,40,140,.08)', cursor: 'pointer', width: '100%', textAlign: 'left', marginBottom: 8 }}
          onClick={() => setSheet(x)}
        >
          <span style={{ fontSize: 24 }}>{x.status === 'open' ? '🎉' : x.withinBudget ? '✅' : '⚠️'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{x.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{soles(x.spent, true)} de {soles(x.budget, true)}</div>
            <div style={{ marginTop: 4 }}><Progress pct={x.progressPct} /></div>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 18 }}>›</span>
        </button>
      ))}

      {sheet === 'new' && (
        <NewOuting
          suggestedBudget={capSalidas ?? undefined}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); reloadAll(); onToast('¡Salida creada!'); }}
        />
      )}
      {sheet && sheet !== 'new' && (
        <OutingSheet
          o={sheet as Outing}
          demo={!!user?.isDemo}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); reloadAll(); }}
        />
      )}
    </>
  );
}

/** Sheet para agregar plata extra recibida (aumenta el tope de salidas) */
function ExtraMoneySheet({ row, onClose, onDone }: { row: BudgetRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const currentCap = row.weeklyCap ?? 0;
  const newCap = currentCap + (Number(amount) || 0);
  return (
    <Sheet title="💰 Recibí plata extra para salir" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
        Si te dieron plata extra para una salida, súmala aquí. Yala actualiza tu tope y te avisa si te pasas en la salida.
      </p>
      <label className="field">
        ¿Cuánto te dieron? (S/)
        <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ej: 30" />
      </label>
      {Number(amount) > 0 && (
        <div style={{ background: 'var(--mint)', borderRadius: 12, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          Tu tope de salidas subirá de <b>{soles(currentCap)}</b> a <b>{soles(newCap)}</b> esta semana.
        </div>
      )}
      <button className="btn block" disabled={!Number(amount)} onClick={async () => {
        await api.setBudget('salidas', newCap);
        onDone();
      }}>Agregar al presupuesto</button>
    </Sheet>
  );
}

function MovementRow({ m, onTap, onDeleted }: { m: Movement; onTap: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmed) { setConfirmed(true); setTimeout(() => setConfirmed(false), 3000); return; }
    setDeleting(true);
    try { await api.deleteMovement(m.id); onDeleted(); } catch { setDeleting(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--line)', padding: '10px 4px' }}>
      <button style={{ flex: 1, background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={onTap}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.counterparty ?? 'Sin nombre'}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{m.aiOpinion}</div>
      </button>
      <b style={{ whiteSpace: 'nowrap', marginRight: 10 }}>{soles(m.amount, true)}</b>
      <button
        onClick={handleDelete}
        disabled={deleting}
        style={{ background: confirmed ? 'var(--red-bg)' : 'var(--lav2)', border: 0, borderRadius: 8, padding: '5px 8px', fontSize: 12, color: confirmed ? 'var(--red)' : 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
        title={confirmed ? 'Toca de nuevo para confirmar' : 'Eliminar gasto'}
      >
        {confirmed ? '¿Seguro?' : '✕'}
      </button>
    </div>
  );
}

function AddExpense({ cat, onClose, onDone }: { cat: Category; onClose: () => void; onDone: (m?: { amount: number }) => void }) {
  const [amount, setAmount] = useState(''); const [who, setWho] = useState(''); const [c, setC] = useState<Category>(cat);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const num = Number(amount.replace(',', '.'));
    try { await api.addMovement({ amount: num, counterparty: who || undefined, category: c }); onDone({ amount: num }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };
  return (
    <Sheet title="Añadir gasto" onClose={onClose}>
      <label className="field">Monto (S/)<input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3.50" /></label>
      <label className="field">¿En qué? (opcional)<input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Café y galleta" /></label>
      <label className="field">Sección<select value={c} onChange={(e) => setC(e.target.value as Category)}>{ORDER.map((k) => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}</select></label>
      {err && <div className="center-note err" style={{ padding: 6 }}>{err}</div>}
      <button className="btn block" disabled={!Number(amount.replace(',', '.'))} onClick={save}>Guardar</button>
    </Sheet>
  );
}

function CapSheet({ row, onClose, onDone }: { row: BudgetRow; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(String(row.weeklyCap ?? 10));
  return (
    <Sheet title={`Tope semanal · ${row.label}`} onClose={onClose}>
      <label className="field">S/ por semana<input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <input type="range" min={0} max={200} step={1} value={Number(v) || 0} onChange={(e) => setV(e.target.value)} style={{ width: '100%', margin: '0 0 14px' }} />
      <button className="btn block" onClick={async () => { await api.setBudget(row.category, Number(v.replace(',', '.')) || 0); onDone(); }}>Guardar tope</button>
    </Sheet>
  );
}

function MoveSheet({ m, onClose, onDone }: { m: Movement; onClose: () => void; onDone: () => void }) {
  return (
    <Sheet title={m.counterparty ?? 'Gasto'} onClose={onClose}>
      <p className="muted">{soles(m.amount, true)} · {m.aiOpinion}</p>
      <div className="muted" style={{ marginBottom: 8 }}>La IA lo puso en esta categoría. ¿Está bien o lo muevo?</div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {ORDER.map((k) => (
          <button key={k} className={'chip' + (k === m.category ? ' active' : '')} onClick={async () => { await api.setCategory(m.id, k); onDone(); }}>{CAT_LABEL[k]}</button>
        ))}
      </div>
    </Sheet>
  );
}

// ─── Gestión de categorías personalizadas ────────────────────────────────────
function ManageCategories({ onBack }: { onBack: () => void }) {
  const cats = useApi(api.categories);
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const addCat = async () => {
    if (!label.trim()) return;
    setBusy(true); setErr(null);
    try {
      const result = await api.addCategory({ label: label.trim(), emoji });
      cats.setData(result);
      setLabel(''); setEmoji('🏷️');
      showSuccess(`"${label.trim()}" agregada ✓`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  const deleteCat = async (key: string, label: string) => {
    setBusy(true);
    try {
      const result = await api.deleteCategory(key);
      cats.setData(result);
      showSuccess(`"${label}" ocultada ✓`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  };

  if (cats.loading && !cats.data) return <Page><Loading /></Page>;

  return (
    <Page>
      <Header back title="Personalizar categorías" />

      {/* Agregar nueva */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Agregar categoría</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <label className="field" style={{ marginBottom: 0, width: 60 }}>
            Emoji
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              style={{ textAlign: 'center', fontSize: 22, padding: '8px 4px' }}
            />
          </label>
          <label className="field" style={{ marginBottom: 0, flex: 1 }}>
            Nombre
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ej: Merch Enhypen"
              onKeyDown={(e) => e.key === 'Enter' && addCat()}
              autoFocus
            />
          </label>
        </div>
        {err && <div className="center-note err" style={{ padding: 6, marginBottom: 8 }}>{err}</div>}
        {successMsg && <div style={{ background: 'var(--mint)', color: 'var(--teal-ink)', borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{successMsg}</div>}
        <button className="btn block" disabled={busy || !label.trim()} onClick={addCat}>Agregar</button>
      </div>

      {/* Lista actual */}
      <div className="section-title"><span>Mis categorías</span></div>
      <div className="card lav">
        {cats.data?.items.length === 0 && <div className="muted" style={{ textAlign: 'center' }}>Cargando…</div>}
        {cats.data?.items.map((c) => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 20 }}>{c.emoji}</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{c.label}</span>
            {c.isSystem
              ? <span className="tag" style={{ fontSize: 11 }}>sistema</span>
              : <span className="tag ok" style={{ fontSize: 11 }}>tuya</span>
            }
            <button
              disabled={busy}
              onClick={() => deleteCat(c.key, c.label)}
              style={{ background: 'none', border: 0, color: 'var(--red)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}
              title="Ocultar categoría"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
        Al ocultar una categoría no se borran tus movimientos anteriores, solo deja de aparecer.
      </p>
    </Page>
  );
}
