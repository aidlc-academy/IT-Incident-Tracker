import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'theme';

/** Read the theme the pre-paint script in index.html already resolved. */
function currentTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function storedPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // Private browsing or blocked storage — fall back to the system setting.
    return null;
  }
}

/**
 * Light/dark theme, applied as `data-theme` on <html>.
 *
 * The initial value is resolved by an inline script in index.html so the first
 * paint is already correct; this provider adopts that value rather than
 * recomputing it. An explicit choice is persisted and wins from then on;
 * without one, the OS preference is followed live.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(currentTheme);
  const [isExplicit, setIsExplicit] = useState(() => storedPreference() !== null);

  // Keep the document attribute in step with state.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Tells the browser which palette to use for form controls and scrollbars.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Follow the OS only while the user has not made an explicit choice.
  useEffect(() => {
    if (isExplicit) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [isExplicit]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisting is acceptable; the choice still applies this session.
      }
      return next;
    });
    setIsExplicit(true);
  }, []);

  /** Drop the saved choice and go back to following the operating system. */
  const useSystemTheme = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setIsExplicit(false);
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, isDark: theme === 'dark', isExplicit, toggleTheme, useSystemTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
