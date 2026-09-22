import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../shared/ThemeToggle';

/** Initials for the avatar chip, e.g. "Alice (Admin)" → "A". */
function initials(user) {
  const source = user?.displayName || user?.username || '?';
  return source.trim().charAt(0).toUpperCase();
}

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

  const navClass = ({ isActive }) => (isActive ? 'navlink navlink--active' : 'navlink');

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 2.5l7.5 3.4v6.4c0 4.6-3.2 8.2-7.5 9.2-4.3-1-7.5-4.6-7.5-9.2V5.9L12 2.5z" />
              <path className="topbar__logo-mark" d="M12 7.6v5.2M12 15.8v.1" />
            </svg>
          </span>
          <span className="topbar__name">IncidentIQ</span>
        </div>

        <nav className="topbar__nav" aria-label="Main">
          <NavLink to="/dashboard" className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/incidents" end className={navClass}>
            Incidents
          </NavLink>
          <NavLink to="/incidents/new" className={navClass}>
            New Incident
          </NavLink>
        </nav>

        <div className="topbar__user">
          <ThemeToggle />
          <span className="topbar__divider" aria-hidden="true" />
          <span className="topbar__identity">
            <span className="topbar__avatar" aria-hidden="true">
              {initials(user)}
            </span>
            <span className="topbar__username">{user?.displayName || user?.username}</span>
          </span>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={handleLogout}
            disabled={loggingOut}
          >
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
