import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
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
  return (
    <div className="app">
      <Routes>
        {/* Públicas: las ve el amigo o el banco, sin login */}
        <Route path="/p/:token" element={<PublicLoan />} />
        <Route path="/banco/:code" element={<BankView />} />
        {!ready ? <Route path="*" element={<Loading />} /> : !user ? (
          <Route path="*" element={<Login />} />
        ) : isNewUser(user) ? (
          /* Usuario nuevo con Google: completar onboarding antes de ver la app */
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
