import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, ThemeColors } from '../theme/tokens';
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

const DISPLAY_MS = 2500;
const FADE_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A toast can outlive the screen that triggered it (e.g. login success
  // fires just as the auth stack unmounts), so this only ever touches
  // ToastProvider's own state - never the caller's.
  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      setToast({ message, kind });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      hideTimeoutRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => setToast(null));
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
              { top: insets.top + spacing.md, opacity },
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
    error: { backgroundColor: colors.danger },
    text: { color: colors.white, fontWeight: '700', fontSize: 14 },
  });
