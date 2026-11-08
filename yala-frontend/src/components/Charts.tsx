export function Donut({ value, max, size = 200, stroke = 22, tone = 'ok', children }: { value: number; max: number | null; size?: number; stroke?: number; tone?: 'ok' | 'warn' | 'over' | 'none'; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  const color = tone === 'over' ? '#e86a6a' : tone === 'warn' ? '#f2a0a0' : '#5fe8d8';
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e0f7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Sparkline({ data, w = 120, h = 36 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data), step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 4 - (v / max) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x} ${y}` : `C${pts[i - 1][0] + step / 2} ${pts[i - 1][1]} ${x - step / 2} ${y} ${x} ${y}`)).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} fill="none" stroke="#1fb5a5" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export function Bars({ data, w = 130, h = 40 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data), bw = w / data.length - 3;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {data.map((v, i) => { const bh = Math.max(4, (v / max) * (h - 2)); return <rect key={i} x={i * (bw + 3)} y={h - bh} width={bw} height={bh} rx="2.5" fill={v > 0 ? '#35b0f0' : '#bfe3f8'} />; })}
    </svg>
  );
}

export function Progress({ pct, tone = 'teal' }: { pct: number; tone?: 'teal' | 'purple' }) {
  return (
    <div className="progress"><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: tone === 'purple' ? 'linear-gradient(90deg,#5fe8d8,#8f7bf0)' : 'linear-gradient(90deg,#5fe8d8,#a79bec)' }} /></div>
  );
}
