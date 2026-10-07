import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FADE_MS } from '../theme/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type ToastKind = 'success' | 'error';

interface ToastState {
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

// Roughly one header row, so the toast clears it on screens that have
// one and still reads as top-anchored on screens that don't.
const HEADER_CLEARANCE = 56;

const DISPLAY_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A toast can outlive the screen that triggered it (e.g. login success
  // fires just as the auth stack unmounts), so this only ever touches
  // ToastProvider's own state - never the caller's.
  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      setToast({ message, kind });
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: FADE_MS });
      hideTimeoutRef.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
          // Not when a newer toast restarted the fade mid-way.
          if (finished) scheduleOnRN(setToast, null);
        });
      }, DISPLAY_MS);
    },
    [opacity],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={styles.root}>
        {children}
        {toast && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              // Offset past a header row rather than sitting on top of
              // it: at insets.top + spacing.md this covered the screen
              // title and, more to the point, the back button - so for
              // its 2.5s the user could see the confirmation but not
              // navigate away from it.
              { top: insets.top + HEADER_CLEARANCE },
              fadeStyle,
              toast.kind === 'error' ? styles.error : styles.success,
            ]}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    toast: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      borderRadius: radii.lg,
      paddingVertical: 12,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      shadowColor: colors.ink,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      zIndex: 999,
    },
    success: { backgroundColor: colors.sage },
    error: { backgroundColor: colors.dangerFill },
    text: { color: colors.white, fontWeight: '700', fontSize: fontSizes.body },
  });
