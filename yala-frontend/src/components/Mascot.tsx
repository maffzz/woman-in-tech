import type { CSSProperties } from 'react';

export type MascotKey = 'huevo' | 'pollo' | 'gallo' | 'chivo' | 'goat';
const INK = '#2a1a6b';
const S = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const Eyes = ({ y = 56, dx = 12, r = 3.6, worried = false }: { y?: number; dx?: number; r?: number; worried?: boolean }) => (
  <g fill={INK}>
    <circle cx={60 - dx} cy={y} r={r} /><circle cx={60 + dx} cy={y} r={r} />
    {worried && <path d="M96 40q3 6 0 9q-3-3 0-9z" fill="#8fd3f7" stroke="none" />}
  </g>
);

function Egg() {
  return (
    <g>
      <path d="M60 14c20 0 33 28 33 52 0 20-14 34-33 34S27 86 27 66c0-24 13-52 33-52z" fill="#fff" {...S} />
      <path d="M33 44l9 8-7 7 9 7" fill="none" stroke="#a79bec" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="78" cy="38" r="5" fill="#e4defa" /><circle cx="84" cy="62" r="4" fill="#d9f8fb" /><circle cx="42" cy="80" r="5" fill="#d9f8fb" />
      <Eyes y={62} dx={11} worried />
      <path d="M52 78q8 -5 16 0" fill="none" {...S} strokeWidth={2.5} />
    </g>
  );
}
function Pollo() {
  return (
    <g>
      <path d="M52 22q-4-10 4-12M60 21q0-11 8-11" fill="none" {...S} />
      <ellipse cx="60" cy="64" rx="34" ry="32" fill="#fff6c9" {...S} />
      <path d="M26 66q-12 2-14 12 12 2 20-6" fill="#fff6c9" {...S} /><path d="M94 66q12 2 14 12-12 2-20-6" fill="#fff6c9" {...S} />
      <Eyes y={58} dx={14} r={4} />
      <path d="M52 68l8 8 8-8z" fill="#ff9d4d" {...S} strokeWidth={2.5} />
      <circle cx="38" cy="72" r="5" fill="#ffc7b0" opacity=".8" /><circle cx="82" cy="72" r="5" fill="#ffc7b0" opacity=".8" />
      <path d="M48 96v8M72 96v8M44 104h8M68 104h8" stroke="#ff9d4d" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}
function Gallo() {
  return (
    <g>
      <path d="M44 24q-2-14 8-10 4-10 12-2 10-4 10 8 8 2 4 14H44z" fill="#ff7b7b" {...S} />
      <ellipse cx="60" cy="62" rx="33" ry="33" fill="#fff" {...S} />
      <path d="M92 50q14-2 14 12-10 10-18 4" fill="#e4defa" {...S} />
      <Eyes y={54} dx={13} r={3.8} />
      <path d="M50 64l10 10 10-10z" fill="#ffb347" {...S} strokeWidth={2.5} />
      <path d="M56 76q4 12 8 0" fill="#ff7b7b" {...S} strokeWidth={2.5} />
      <path d="M46 94l-4 12M74 94l4 12M38 106h10M72 106h10" stroke="#ffb347" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}
function Goat({ goat = false }: { goat?: boolean }) {
  const horn = goat ? '#8d8aa8' : '#f6b73c';
  const ear = goat ? '#cfcde6' : '#f7c9b6';
  const scarf = goat ? '#5a5680' : '#5fe8d8';
  return (
    <g>
      <path d="M44 38q-8-14-2-24 8 8 12 24z" fill={horn} {...S} /><path d="M76 38q8-14 2-24-8 8-12 24z" fill={horn} {...S} />
      <ellipse cx="26" cy="54" rx="13" ry="8" transform="rotate(-25 26 54)" fill={ear} {...S} />
      <ellipse cx="94" cy="54" rx="13" ry="8" transform="rotate(25 94 54)" fill={ear} {...S} />
      <ellipse cx="60" cy="60" rx="31" ry="29" fill="#fff" {...S} />
      {goat ? (
        <g>
          <path d="M34 54h52v8q0 6-8 6H44q-10 0-10-8z" fill={INK} {...S} />
          <path d="M60 52v8" stroke="#fff" strokeWidth="2" />
          <path d="M40 22l6 8 7-12 7 12 7-12 6 8v8H40z" fill="#ffd34d" {...S} transform="translate(0 -4)" />
        </g>
      ) : <Eyes y={54} dx={13} r={4} />}
      <ellipse cx="60" cy="76" rx="15" ry="10" fill={goat ? '#e4defa' : '#f9b4cd'} {...S} strokeWidth={2.5} />
      <circle cx="55" cy="75" r="1.8" fill={INK} /><circle cx="65" cy="75" r="1.8" fill={INK} />
      <path d="M56 90q4 8 8 0" fill="#fff" {...S} strokeWidth={2.5} />
      <path d="M34 92q26 14 52 0v12q-26 12-52 0z" fill={scarf} {...S} />
      <path d="M70 100l6 14 8-4-4-12" fill={scarf} {...S} />
    </g>
  );
}

export function Mascot({ kind, size = 120, locked = false, style }: { kind: MascotKey; size?: number; locked?: boolean; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={kind} style={{ filter: locked ? 'grayscale(1)' : undefined, opacity: locked ? 0.7 : 1, ...style }}>
      {kind === 'huevo' && <Egg />}{kind === 'pollo' && <Pollo />}{kind === 'gallo' && <Gallo />}
      {kind === 'chivo' && <Goat />}{kind === 'goat' && <Goat goat />}
    </svg>
  );
}
