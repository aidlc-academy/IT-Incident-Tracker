import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">IQ</span>
          <span className="topbar__name">IncidentIQ</span>
        </div>

        <nav className="topbar__nav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'navlink navlink--active' : 'navlink')}>
            Dashboard
          </NavLink>
          <NavLink to="/incidents" end className={({ isActive }) => (isActive ? 'navlink navlink--active' : 'navlink')}>
            Incidents
          </NavLink>
          <NavLink to="/incidents/new" className={({ isActive }) => (isActive ? 'navlink navlink--active' : 'navlink')}>
            New Incident
          </NavLink>
        </nav>

        <div className="topbar__user">
          <span className="topbar__username">
            {user?.displayName || user?.username}
          </span>
          <button type="button" className="btn btn--sm btn--ghost" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
