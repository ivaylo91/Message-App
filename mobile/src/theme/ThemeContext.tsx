import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  BUBBLE_GRADIENT_PRESETS,
  BubbleGradientPair,
  darkColors,
  DEFAULT_BUBBLE_GRADIENT_ID,
  lightColors,
  ThemeColors,
  ThemePreference,
  ThemeScheme,
} from './tokens';
import { loadBubbleGradientId, saveBubbleGradientId } from './bubbleGradientStorage';
import { loadThemePreference, saveThemePreference } from './themePreferenceStorage';

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: ThemeScheme;
  gradients: BubbleGradientPair;
  bubbleGradientId: string;
  setBubbleGradientId: (id: string) => void;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const defaultPreset = BUBBLE_GRADIENT_PRESETS[0];

const lightValue: ThemeContextValue = {
  colors: lightColors,
  scheme: 'light',
  gradients: defaultPreset.light,
  bubbleGradientId: DEFAULT_BUBBLE_GRADIENT_ID,
  setBubbleGradientId: () => {},
  themePreference: 'system',
  setThemePreference: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(lightValue);

// Follows the OS light/dark setting live via useColorScheme(), which is
// what this app did exclusively - per the original "light and dark mode
// by system" request. That stays the default: themePreference is
// 'system' unless someone deliberately overrides it in ProfileScreen, so
// an existing install is unaffected. The override exists because
// following the OS is the right default but a poor rule - people read in
// bed with the phone in light mode, and vice versa.
//
// The bubble gradient works the same way: an explicit personal choice,
// persisted locally per device rather than synced - a display preference
// for how *this* user sees their own outgoing bubbles, not a
// shared/broadcast identity setting.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme: ThemeScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const scheme: ThemeScheme = themePreference === 'system' ? systemScheme : themePreference;
  const [bubbleGradientId, setBubbleGradientIdState] = useState(DEFAULT_BUBBLE_GRADIENT_ID);

  useEffect(() => {
    void loadBubbleGradientId().then((saved) => {
      if (saved && BUBBLE_GRADIENT_PRESETS.some((preset) => preset.id === saved)) {
        setBubbleGradientIdState(saved);
      }
    });
  }, []);

  useEffect(() => {
    void loadThemePreference().then((saved) => {
      if (saved) setThemePreferenceState(saved);
    });
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    void saveThemePreference(preference);
  }, []);

  const setBubbleGradientId = useCallback((id: string) => {
    setBubbleGradientIdState(id);
    void saveBubbleGradientId(id);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const preset =
      BUBBLE_GRADIENT_PRESETS.find((candidate) => candidate.id === bubbleGradientId) ??
      defaultPreset;
    return {
      colors: scheme === 'dark' ? darkColors : lightColors,
      scheme,
      gradients: preset[scheme],
      bubbleGradientId: preset.id,
      setBubbleGradientId,
      themePreference,
      setThemePreference,
    };
  }, [scheme, bubbleGradientId, setBubbleGradientId, themePreference, setThemePreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
