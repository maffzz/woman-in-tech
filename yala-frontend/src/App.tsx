import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { api, type Movement } from './api/yala';
import { Loading } from './components/Ui';
import Login from './pages/Login';
import Home from './pages/Home';
import Sections from './pages/Sections';
import Assistant from './pages/Assistant';
import Levels from './pages/Levels';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import Connect from './pages/Connect';
import Onboarding from './pages/Onboarding';
import { BankView, PublicLoan } from './pages/Public';

/** Usuario nuevo = nunca configuró su mesada (viene de Google login por primera vez) */
const isNewUser = (user: import('./api/yala').User) =>
  user.weeklyAllowance === null && !user.isDemo;

export default function App() {
  const { user, ready } = useAuth();
  const lastSyncRef = useRef<number>(0);

  // Auto-sync silencioso cuando el usuario tiene Gmail conectado
  // Se lanza al abrir la app y cuando vuelve de segundo plano
  useEffect(() => {
    if (!user || user.dataMode !== 'gmail' || user.isDemo) return;

    const doSync = async () => {
      const now = Date.now();
      // No sincronizar más de una vez cada 5 minutos
      if (now - lastSyncRef.current < 5 * 60 * 1000) return;
      lastSyncRef.current = now;
      try {
        const r = await api.gmailSync();
        if (r.imported > 0) {
          // Guardar en sessionStorage para que Connect los muestre
          const mv = await api.movements({ limit: r.imported });
          const pending = mv.items.slice(0, r.imported);
          sessionStorage.setItem('yala_pending_review', JSON.stringify(pending));
          // Disparar evento para que Connect lo detecte si está abierto
          window.dispatchEvent(new CustomEvent('yala:new-movements', { detail: pending }));
        }
      } catch {
        // Falla silenciosamente — el usuario puede sincronizar manualmente
      }
    };

    // Sync al cargar
    doSync();

    // Sync cuando la app vuelve a primer plano (tab visible)
    const onVisible = () => { if (document.visibilityState === 'visible') doSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, user?.dataMode]);

  return (
    <div className="app">
      <Routes>
        {/* Públicas: las ve el amigo o el banco, sin login */}
        <Route path="/p/:token" element={<PublicLoan />} />
        <Route path="/banco/:code" element={<BankView />} />
        {!ready ? <Route path="*" element={<Loading />} /> : !user ? (
          <Route path="*" element={<Login />} />
        ) : isNewUser(user) ? (
          <>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Home />} />
            <Route path="/secciones" element={<Sections />} />
            <Route path="/asistente" element={<Assistant />} />
            <Route path="/niveles" element={<Levels />} />
            <Route path="/amigos" element={<Friends />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/conectar" element={<Connect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </div>
  );
}
