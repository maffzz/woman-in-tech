import { useEffect, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export function BottomNav() {
  const items = [
    ['/', '🏠', 'Inicio'],
    ['/amigos', '🤝', 'Amigos'],
    ['/secciones', '📊', 'Secciones'],
    ['/perfil', '⭐', 'Perfil'],
  ] as const;
  return (
    <nav className="bottom-nav">
      {items.map(([to, icon, label]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-pill' + (isActive ? ' active' : '')}>
          <span style={{ fontSize: 18, display: 'block', lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 10 }}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Page({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return <div className="screen">{children}{nav && <BottomNav />}</div>;
}

export function Header({ kicker, title, right, back }: { kicker?: string; title: string; right?: ReactNode; back?: boolean }) {
  const nav = useNavigate();
  return (
    <header className={'header' + (back ? ' with-back' : '')}>
      {back && <button className="icon-btn" onClick={() => nav(-1)} aria-label="Volver">‹</button>}
      <div className="titles">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
      </div>
      {right ?? (back ? <span style={{ width: 36 }} /> : null)}
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const Loading = () => <div className="center-note">Cargando…</div>;
export function ErrorNote({ msg, retry }: { msg: string; retry?: () => void }) {
  return <div className="center-note err">{msg}{retry && <><br /><button className="btn ghost" onClick={retry}>Reintentar</button></>}</div>;
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast">{msg}</div> : null;
}
