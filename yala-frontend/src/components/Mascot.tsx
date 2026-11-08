import type { CSSProperties } from 'react';

export type MascotKey = 'pollito' | 'colibri' | 'conejo' | 'oveja' | 'goat';
const INK = '#2a1a6b';
const S = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const Eyes = ({ y = 56, dx = 12, r = 3.6 }: { y?: number; dx?: number; r?: number }) => (
  <g fill={INK}><circle cx={60 - dx} cy={y} r={r} /><circle cx={60 + dx} cy={y} r={r} /></g>
);

/** Pollito — amarillo con pico naranja */
function Pollito() {
  return (
    <g>
      <path d="M52 22q-4-10 4-12M60 21q0-11 8-11" fill="none" {...S} />
      <ellipse cx="60" cy="64" rx="34" ry="32" fill="#fff6c9" {...S} />
      <path d="M26 66q-12 2-14 12 12 2 20-6" fill="#fff6c9" {...S} />
      <path d="M94 66q12 2 14 12-12 2-20-6" fill="#fff6c9" {...S} />
      <Eyes y={58} dx={14} r={4} />
      <path d="M52 68l8 8 8-8z" fill="#ff9d4d" {...S} strokeWidth={2.5} />
      <circle cx="38" cy="72" r="5" fill="#ffc7b0" opacity=".8" />
      <circle cx="82" cy="72" r="5" fill="#ffc7b0" opacity=".8" />
      <path d="M48 96v8M72 96v8M44 104h8M68 104h8" stroke="#ff9d4d" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/** Colibrí — cuerpo verde esmeralda, pico largo, alas */
function Colibri() {
  return (
    <g>
      {/* cuerpo */}
      <ellipse cx="60" cy="62" rx="22" ry="28" fill="#5fe8d8" {...S} />
      {/* alas */}
      <path d="M38 50q-18-10-20 8q10 4 22 0z" fill="#8fd3f7" {...S} />
      <path d="M82 50q18-10 20 8q-10 4-22 0z" fill="#8fd3f7" {...S} />
      {/* cabeza */}
      <circle cx="60" cy="34" r="18" fill="#5fe8d8" {...S} />
      {/* crest */}
      <path d="M54 18q-2-10 6-14 2 8-2 14M60 16q0-10 8-12 0 8-4 12" fill="#35b0a5" {...S} />
      {/* pico largo */}
      <path d="M60 44l-16 4 16 4z" fill="#fff" {...S} strokeWidth={2} />
      <Eyes y={30} dx={9} r={3.5} />
      {/* cola */}
      <path d="M48 88l-8 18M60 90v18M72 88l8 18" stroke="#35b0a5" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

/** Conejo — orejas largas, nariz rosada */
function Conejo() {
  return (
    <g>
      {/* orejas */}
      <ellipse cx="44" cy="28" rx="9" ry="22" fill="#fff" {...S} />
      <ellipse cx="44" cy="28" rx="5" ry="17" fill="#ffc7b0" stroke="none" />
      <ellipse cx="76" cy="28" rx="9" ry="22" fill="#fff" {...S} />
      <ellipse cx="76" cy="28" rx="5" ry="17" fill="#ffc7b0" stroke="none" />
      {/* cuerpo */}
      <ellipse cx="60" cy="72" rx="30" ry="28" fill="#fff" {...S} />
      {/* cara */}
      <circle cx="60" cy="58" r="22" fill="#fff" {...S} />
      <Eyes y={54} dx={11} r={4} />
      {/* nariz */}
      <path d="M56 64l4 5 4-5" fill="#ffc7b0" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {/* bigotes */}
      <path d="M32 62l18 4M88 62L70 66" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      {/* colita */}
      <circle cx="88" cy="78" r="8" fill="#e8e4fa" {...S} />
    </g>
  );
}

/** Oveja — lana esponjosa, cara blanca */
function Oveja() {
  return (
    <g>
      {/* lana (burbujas) */}
      <circle cx="38" cy="50" r="18" fill="#f0eeff" {...S} />
      <circle cx="60" cy="38" r="22" fill="#f0eeff" {...S} />
      <circle cx="82" cy="50" r="18" fill="#f0eeff" {...S} />
      <circle cx="30" cy="68" r="14" fill="#f0eeff" {...S} />
      <circle cx="90" cy="68" r="14" fill="#f0eeff" {...S} />
      <circle cx="52" cy="64" r="16" fill="#f0eeff" {...S} />
      <circle cx="68" cy="64" r="16" fill="#f0eeff" {...S} />
      {/* cara */}
      <ellipse cx="60" cy="74" rx="18" ry="16" fill="#fff" {...S} />
      <Eyes y={70} dx={9} r={3.5} />
      {/* nariz */}
      <ellipse cx="60" cy="80" rx="6" ry="4" fill="#ffc7b0" {...S} strokeWidth={2} />
      {/* patitas */}
      <path d="M44 94v16M56 96v14M64 96v14M76 94v16" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

/** GOAT — cabra con corona */
function GoatMascot() {
  return (
    <g>
      {/* cuernos */}
      <path d="M44 38q-8-14-2-24 8 8 12 24z" fill="#8d8aa8" {...S} />
      <path d="M76 38q8-14 2-24-8 8-12 24z" fill="#8d8aa8" {...S} />
      {/* orejas */}
      <ellipse cx="26" cy="54" rx="13" ry="8" transform="rotate(-25 26 54)" fill="#cfcde6" {...S} />
      <ellipse cx="94" cy="54" rx="13" ry="8" transform="rotate(25 94 54)" fill="#cfcde6" {...S} />
      {/* cuerpo */}
      <ellipse cx="60" cy="60" rx="31" ry="29" fill="#fff" {...S} />
      {/* cara GOAT con anteojos */}
      <path d="M34 54h52v8q0 6-8 6H44q-10 0-10-8z" fill={INK} {...S} />
      <path d="M60 52v8" stroke="#fff" strokeWidth="2" />
      {/* corona */}
      <path d="M40 22l6 8 7-12 7 12 7-12 6 8v8H40z" fill="#ffd34d" {...S} transform="translate(0 -4)" />
      <ellipse cx="60" cy="76" rx="15" ry="10" fill="#e4defa" {...S} strokeWidth={2.5} />
      <circle cx="55" cy="75" r="1.8" fill={INK} /><circle cx="65" cy="75" r="1.8" fill={INK} />
      {/* bufanda */}
      <path d="M34 92q26 14 52 0v12q-26 12-52 0z" fill="#5a5680" {...S} />
      <path d="M70 100l6 14 8-4-4-12" fill="#5a5680" {...S} />
    </g>
  );
}

export function Mascot({ kind, size = 120, locked = false, style }: { kind: MascotKey; size?: number; locked?: boolean; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={kind}
      style={{ filter: locked ? 'grayscale(1)' : undefined, opacity: locked ? 0.7 : 1, ...style }}>
      {kind === 'pollito' && <Pollito />}
      {kind === 'colibri' && <Colibri />}
      {kind === 'conejo'  && <Conejo />}
      {kind === 'oveja'   && <Oveja />}
      {kind === 'goat'    && <GoatMascot />}
    </svg>
  );
}
