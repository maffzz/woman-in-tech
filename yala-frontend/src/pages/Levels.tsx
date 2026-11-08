import { api } from '../api/yala';
import { Progress } from '../components/Charts';
import { Mascot } from '../components/Mascot';
import { ErrorNote, Header, Loading, Page } from '../components/Ui';
import { useApi } from '../lib/useApi';

export default function Levels() {
  const l = useApi(api.levels);
  if (l.loading && !l.data) return <Page><Loading /></Page>;
  if (l.error || !l.data) return <Page><ErrorNote msg={l.error ?? 'Error'} retry={l.reload} /></Page>;
  const x = l.data;
  return (
    <Page>
      <Header kicker="Niveles" title="Tu evolución" />
      <div className="streak">
        <div className="row between" style={{ fontSize: 13, marginBottom: 8 }}><b>Racha: {x.streakWeeks} semanas</b><span>Meta GOAT: {x.goatWeeks}</span></div>
        <Progress pct={(x.streakWeeks / x.goatWeeks) * 100} tone="purple" />
        <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>Cada semana dentro del presupuesto suma a tu racha.</div>
      </div>
      {x.levels.map((lv) => (
        <div key={lv.key} className={'level ' + lv.status}>
          <Mascot kind={lv.key} size={46} locked={lv.status === 'locked'} />
          <div><div className="name">{lv.name}</div><div className="hint">{lv.hint}</div></div>
          <span className={'badge ' + (lv.status === 'current' ? 'cur' : lv.status === 'locked' ? 'lock' : '')}>{lv.status === 'done' ? 'Listo' : lv.status === 'current' ? 'Aquí' : 'Bloqueado'}</span>
        </div>
      ))}
      {x.nextLevel && <p className="muted" style={{ textAlign: 'center' }}>Para ser {x.nextLevel.name} te faltan {x.nextLevel.weeksNeeded} {x.nextLevel.weeksNeeded === 1 ? 'semana' : 'semanas'}.</p>}
    </Page>
  );
}
