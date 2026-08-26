'use client';

/**
 * ThemeProvider — manages dark/light theme for the Thermal Decision Engine.
 *
 * Reads preference from localStorage ('tde_theme') on mount, falling back to
 * the OS/browser prefers-color-scheme. Updates the <html> element's classList
 * (.dark) so Tailwind's dark: variants resolve correctly.
 *
 * The ThemeScript in layout.tsx applies the initial class synchronously before
 * first paint, preventing flash of wrong theme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'tde_theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialise from DOM state (set by the inline ThemeScript before hydration).
  // We use a lazy initializer that runs only on the client, so the value is
  // always consistent with what the ThemeScript already applied.
  const [theme, setTheme] = useState<Theme>(() => {
    // During SSR this code never runs (no document). On the client it reads
    // the class that the ThemeScript set synchronously before first paint.
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark'; // SSR default — server always renders dark
  });

  // No separate sync effect needed — state is already correct from the initializer.

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // localStorage unavailable (private browsing, etc.)
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Inline script source text — inject into layout.tsx via <script dangerouslySetInnerHTML>.
 * Sets .dark class on <html> BEFORE React hydration to avoid flash.
 * Not exported as JSX to avoid adding a client-only import in the server layout.
 */
export const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('tde_theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (systemDark ? 'dark' : 'dark'); // default dark for this product
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`;
