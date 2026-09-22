import { createContext, useContext, useState, useCallback } from 'react';
import { getSession, setSession } from '../api/client';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

/**
 * Demo authentication. The backend validates the chosen username on /api/login
 * and again, via the x-demo-user header, on every protected request — the
 * session stored here is the client half of that contract, not a credential.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession());

  const login = useCallback(async (username) => {
    const session = await authApi.login(username); // throws ApiError on failure
    setSession(session);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The backend session is stateless, so a failed call must not trap the
      // user in a logged-in UI. Clearing the client session is what matters.
    }
    setSession(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
