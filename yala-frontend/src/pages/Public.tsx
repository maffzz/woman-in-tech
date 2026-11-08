import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/yala';
import { Mascot } from '../components/Mascot';
import { ErrorNote, Loading } from '../components/Ui';
import { shortDate, soles } from '../lib/format';
import { useApi } from '../lib/useApi';

/** Link que recibe el amigo (sin login, solo apodo). */
export function PublicLoan() {
  const { token = '' } = useParams();
  const l = useApi(() => api.publicLoan(token), [token]);
  const [ok, setOk] = useState(false);
  if (l.loading && !l.data) return <Loading />;
  if (l.error || !l.data) return <ErrorNote msg={l.error ?? 'Link no válido'} />;
  const x = l.data;
  return (
    <div className="login">
      <Mascot kind="chivo" size={110} />
      <h2>Hola {x.friendNickname} 👋</h2>
      <p style={{ maxWidth: 300 }}>{x.ownerFirstName} anotó {soles(x.amount, true)}{x.concept ? ` de ${x.concept}` : ''} para el {shortDate(x.dueDate)}.</p>
      {(ok || x.confirmed) ? <div className="tag ok">¡Gracias! Confirmado ✓</div> : <button className="btn" onClick={async () => { await api.confirmLoan(token); setOk(true); }}>Sí, es correcto</button>}
      <p className="disclaimer" style={{ maxWidth: 280 }}>Yala solo guarda tu apodo. Si hay algún error, avísale a {x.ownerFirstName}.</p>
    </div>
  );
}

/** Vista del banco: solo nivel, meses e indicadores. */
export function BankView() {
  const { code = '' } = useParams();
  const c = useApi(() => api.publicCert(code), [code]);
  if (c.loading && !c.data) return <Loading />;
  if (c.error || !c.data) return <ErrorNote msg={c.error ?? 'Código no válido'} />;
  const p = c.data.payload;
  return (
    <div style={{ padding: 22, maxWidth: 430, margin: '0 auto' }}>
      <div className="kicker">Perfil de hábitos · Yala</div>
      <h1 style={{ margin: '4px 0 12px' }}>{p.holderFirstName}</h1>
      {p.demo && <div className="tag late" style={{ marginBottom: 10, display: 'inline-block' }}>DEMO · no es un documento real</div>}
      <div className="card score-ring"><div className="n">{p.score ?? '—'}</div><div style={{ fontWeight: 700, fontSize: 18 }}>{p.level}{p.provisional ? ' (provisional)' : ''}</div><div className="l">{p.monthsOfHistory} meses de historial</div></div>
      <div className="card">{p.indicators.map((i) => <div key={i.key} className="ind"><div className="row between"><span>{i.label}</span><b>{i.score ?? '—'}</b></div><div className="progress"><div style={{ width: `${i.score ?? 0}%`, background: 'linear-gradient(90deg,#5fe8d8,#8f7bf0)' }} /></div></div>)}</div>
      <p className="disclaimer">{p.disclaimer}</p>
      <p className="disclaimer">Código {c.data.code} · vence {shortDate(c.data.expiresAt)}</p>
    </div>
  );
}
