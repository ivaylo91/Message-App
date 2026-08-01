import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, gradients, lightColors, ThemeColors, ThemeScheme } from './tokens';

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: ThemeScheme;
  gradients: (typeof gradients)[ThemeScheme];
}

const lightValue: ThemeContextValue = {
  colors: lightColors,
  scheme: 'light',
  gradients: gradients.light,
};

const ThemeContext = createContext<ThemeContextValue>(lightValue);

// Follows the OS light/dark setting live via useColorScheme() - no
// in-app toggle, per the "light and dark mode by system" request.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme: ThemeScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === 'dark' ? darkColors : lightColors,
      scheme,
      gradients: gradients[scheme],
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
