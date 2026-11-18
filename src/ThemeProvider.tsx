import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkPalette, lightPalette, Palette } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

type Ctx = {
  c: Palette;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const KEY = 'jewelar.themeMode';
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(v => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<Ctx>(() => {
    const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
    const setMode = (m: ThemeMode) => {
      setModeState(m);
      AsyncStorage.setItem(KEY, m).catch(() => {});
    };
    return {
      c: isDark ? darkPalette : lightPalette,
      mode,
      setMode,
      toggle: () => setMode(isDark ? 'light' : 'dark'),
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}

/** Build a StyleSheet from the current palette; rebuilt only when the theme changes. */
export function useStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(c), [c]);
}
