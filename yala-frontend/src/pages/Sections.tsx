import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type BudgetRow, type Category, type Movement } from '../api/yala';
import { Donut } from '../components/Charts';
import { Mascot } from '../components/Mascot';
import { ErrorNote, Header, Loading, Page, Sheet, Toast } from '../components/Ui';
import { CAT_LABEL, soles } from '../lib/format';
import { useApi } from '../lib/useApi';

const ORDER: Category[] = ['comida', 'transporte', 'salidas', 'suscripciones', 'juegos', 'recargas', 'entretenimiento', 'otros'];

export default function Sections() {
  const [sp, setSp] = useSearchParams();
  const cat = (sp.get('c') as Category) || 'comida';
  const b = useApi(api.budgets);
  const mv = useApi(() => api.movements({ category: cat, type: 'expense', limit: 8 }), [cat]);
  const [sheet, setSheet] = useState<null | 'add' | 'cap' | { move: Movement }>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  if (b.loading && !b.data) return <Page><Loading /></Page>;
  if (b.error || !b.data) return <Page><ErrorNote msg={b.error ?? 'Error'} retry={b.reload} /></Page>;
  const row: BudgetRow = b.data.items.find((i) => i.category === cat) ?? { category: cat, label: CAT_LABEL[cat], weeklyCap: null, spent: 0, remaining: null, pct: null, today: 0, hormiga: 0, level: 'none' };
  const refresh = () => { b.reload(); mv.reload(); };
  const msg = row.weeklyCap === null ? 'Aún no tienes tope aquí. Ponle uno y te voy avisando.'
    : row.level === 'over' ? 'Te pasaste un poco, no pasa nada. Ajustamos la próxima semana.'
    : row.level === 'warn' ? `Ojo, vas cerca del tope. Te quedan ${soles(row.remaining ?? 0)}.`
    : `Vas bien. Te quedan ${soles(row.remaining ?? 0)} para lo que falta de la semana.`;

  return (
    <Page>
      <Header back title={CAT_LABEL[cat]} right={<button className="pill" style={{ border: 0, background: 'var(--lav2)', color: 'var(--ink)' }} onClick={() => setSheet('add')}>+ Gasto</button>} />
      <div className="chips">
        {ORDER.map((c) => <button key={c} className={'chip' + (c === cat ? ' active' : '')} onClick={() => setSp({ c })}>{CAT_LABEL[c]}</button>)}
      </div>

      <div className="card">
        <Donut value={row.spent} max={row.weeklyCap} tone={row.level} size={190}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{soles(row.spent, true)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{row.weeklyCap === null ? 'sin tope' : `de ${soles(row.weeklyCap, true)} · ${row.pct}%`}</div>
          </div>
        </Donut>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => setSheet('add')}>+ Añadir gasto</button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => setSheet('cap')}>Ajustar tope</button>
        </div>
        <div className="say"><Mascot kind="chivo" size={34} /><span>{msg}</span></div>
      </div>

      <div className="tiles">
        <div className="tile hoy">Hoy<b>{soles(row.today, true)}</b></div>
        <div className={'tile quedan ' + row.level}>Quedan<b>{row.remaining === null ? '—' : soles(Math.max(0, row.remaining), true)}</b>{(row.level === 'warn' || row.level === 'over') && <span style={{ fontSize: 10 }}>cerca del tope</span>}</div>
        <div className="tile hormiga">Hormiga<b>{soles(row.hormiga, true)}</b></div>
      </div>

      <div className="card lav">
        {mv.data?.items.length === 0 && <div className="muted" style={{ textAlign: 'center' }}>Sin gastos en esta sección todavía.</div>}
        {mv.data?.items.map((m) => (
          <button key={m.id} className="list-row" onClick={() => setSheet({ move: m })}>
            <span>{m.counterparty ?? 'Sin nombre'}<br /><span className="muted" style={{ fontSize: 11 }}>{m.aiOpinion}</span></span>
            <b style={{ whiteSpace: 'nowrap' }}>{soles(m.amount, true)}</b>
          </button>
        ))}
      </div>

      {sheet === 'add' && <AddExpense cat={cat} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); setToast('Gasto guardado'); }} />}
      {sheet === 'cap' && <CapSheet row={row} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); setToast('Tope actualizado'); }} />}
      {sheet && typeof sheet === 'object' && 'move' in sheet && <MoveSheet m={sheet.move} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); setToast('Categoría cambiada'); }} />}
      <Toast msg={toast} />
    </Page>
  );
}

function AddExpense({ cat, onClose, onDone }: { cat: Category; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(''); const [who, setWho] = useState(''); const [c, setC] = useState<Category>(cat);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try { await api.addMovement({ amount: Number(amount.replace(',', '.')), counterparty: who || undefined, category: c }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
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
      <input type="range" min={0} max={100} step={0.5} value={Number(v) || 0} onChange={(e) => setV(e.target.value)} style={{ width: '100%', margin: '0 0 14px' }} />
      <button className="btn block" onClick={async () => { await api.setBudget(row.category, Number(v.replace(',', '.')) || 0); onDone(); }}>Guardar tope</button>
    </Sheet>
  );
}

function MoveSheet({ m, onClose, onDone }: { m: Movement; onClose: () => void; onDone: () => void }) {
  return (
    <Sheet title={m.counterparty ?? 'Gasto'} onClose={onClose}>
      <p className="muted">{soles(m.amount, true)} · {m.aiOpinion}</p>
      <div className="muted" style={{ marginBottom: 8 }}>¿No es de esta sección? Muévelo (aprendo para la próxima):</div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {ORDER.map((k) => <button key={k} className={'chip' + (k === m.category ? ' active' : '')} onClick={async () => { await api.setCategory(m.id, k); onDone(); }}>{CAT_LABEL[k]}</button>)}
      </div>
    </Sheet>
  );
}
