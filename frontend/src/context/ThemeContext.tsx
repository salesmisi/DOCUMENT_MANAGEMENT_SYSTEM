import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

const THEME_KEY = 'dms_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return (saved === 'dark' || saved === 'system') ? (saved as Theme) : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;

    const apply = (t: Theme) => {
      if (t === 'system') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) root.classList.add('dark'); else root.classList.remove('dark');
      } else if (t === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    apply(theme);
    localStorage.setItem(THEME_KEY, theme);

    // if system, listen for changes
    let mql: MediaQueryList | null = null;
    const handleChange = (ev: MediaQueryListEvent) => {
      if (theme === 'system') {
        if (ev.matches) root.classList.add('dark'); else root.classList.remove('dark');
      }
    };
    if (window.matchMedia) {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', handleChange);
    }

    return () => {
      if (mql) mql.removeEventListener('change', handleChange);
    };
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
