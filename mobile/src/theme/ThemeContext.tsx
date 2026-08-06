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
  ThemeScheme,
} from './tokens';
import { loadBubbleGradientId, saveBubbleGradientId } from './bubbleGradientStorage';

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: ThemeScheme;
  gradients: BubbleGradientPair;
  bubbleGradientId: string;
  setBubbleGradientId: (id: string) => void;
}

const defaultPreset = BUBBLE_GRADIENT_PRESETS[0];

const lightValue: ThemeContextValue = {
  colors: lightColors,
  scheme: 'light',
  gradients: defaultPreset.light,
  bubbleGradientId: DEFAULT_BUBBLE_GRADIENT_ID,
  setBubbleGradientId: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(lightValue);

// Follows the OS light/dark setting live via useColorScheme() - no
// in-app toggle, per the "light and dark mode by system" request. The
// bubble gradient is the opposite: an explicit personal choice (see
// ProfileScreen), persisted locally per device rather than synced -
// it's a display preference for how *this* user sees their own
// outgoing bubbles, not a shared/broadcast identity setting.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme: ThemeScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [bubbleGradientId, setBubbleGradientIdState] = useState(DEFAULT_BUBBLE_GRADIENT_ID);

  useEffect(() => {
    void loadBubbleGradientId().then((saved) => {
      if (saved && BUBBLE_GRADIENT_PRESETS.some((preset) => preset.id === saved)) {
        setBubbleGradientIdState(saved);
      }
    });
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
    };
  }, [scheme, bubbleGradientId, setBubbleGradientId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
