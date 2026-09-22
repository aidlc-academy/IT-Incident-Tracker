import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS } from '../utils/constants';
import ErrorBanner from '../components/shared/ErrorBanner';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('alice');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__head">
          <span className="topbar__logo">IQ</span>
          <h1>IncidentIQ</h1>
          <p className="login__sub">IT incident triage and SLA management</p>
        </div>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit} className="form">
          <div className="field">
            <label htmlFor="user">Sign in as</label>
            <select id="user" value={username} onChange={(e) => setUsername(e.target.value)}>
              {DEMO_USERS.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login__note">
          Demo authentication — no password required. The selected user is sent
          with every request and validated by the backend.
        </p>
      </div>
    </div>
  );
}
