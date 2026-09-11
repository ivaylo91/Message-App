import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Touchable } from './Touchable';
import { elevation, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

// A bottom sheet for choices, replacing Alert.alert for anything with more
// than one outcome.
//
// Alert is where this app's worst UI bug came from: React Native's Android
// implementation does buttons.slice(0, 3) - "At most three buttons
// (neutral, negative, positive). Ignore rest." - which silently dropped
// "Other" and "Cancel" from the report dialog and left no way out of it.
// A sheet has no such limit, so the whole class of bug goes away rather
// than being avoided by counting buttons at each call site.
//
// Single-button error acknowledgements deliberately stay on Alert: they
// have one outcome, cannot truncate, and a native alert is the right
// weight for "that didn't work".

export interface ConfirmOption {
  // Identifies the choice to the caller; returned from confirm().
  id: string;
  label: string;
  destructive?: boolean;
}

interface ConfirmRequest {
  title: string;
  message?: string;
  options: ConfirmOption[];
  cancelLabel: string;
}

interface ConfirmContextValue {
  // Resolves with the chosen option's id, or null if dismissed. Promise-
  // based so call sites read top to bottom instead of nesting their
  // follow-up work inside an onPress callback.
  confirm: (request: ConfirmRequest) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: async () => null,
});

const SLIDE_MS = 220;

export function ConfirmSheetProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((id: string | null) => void) | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const confirm = useCallback((next: ConfirmRequest) => {
    // A second request while one is open would strand the first promise
    // forever, so the outgoing one is resolved as dismissed.
    resolveRef.current?.(null);
    setRequest(next);
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [request, progress]);

  const close = useCallback((id: string | null) => {
    // Resolve before the exit animation rather than after: the caller's
    // work (a navigation, a delete) should not wait on 220ms of easing,
    // and the sheet is already visually committed at this point.
    resolveRef.current?.(id);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        visible={request !== null}
        transparent
        animationType="fade"
        onRequestClose={() => close(null)}
      >
        <View style={styles.root}>
          {/* The scrim is a sibling behind the sheet, not its parent.
              Tapping it dismisses - the gesture people try first, which
              Alert never supported - but as a parent it would also catch
              taps on the sheet's own title, message and padding, so the
              sheet would appear to close at random. */}
          <Touchable
            style={StyleSheet.absoluteFill}
            onPress={() => close(null)}
            ripple={null}
            accessibilityRole="button"
            accessibilityLabel={request?.cancelLabel}
          />
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md },
              {
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [320, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.grabber} />
            {request && (
              <>
                <Text style={styles.title}>{request.title}</Text>
                {request.message && <Text style={styles.message}>{request.message}</Text>}
                {request.options.map((option) => (
                  <Touchable
                    key={option.id}
                    style={styles.option}
                    onPress={() => close(option.id)}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[styles.optionText, option.destructive && styles.optionDestructive]}
                    >
                      {option.label}
                    </Text>
                  </Touchable>
                ))}
                <Touchable
                  style={styles.cancel}
                  onPress={() => close(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelText}>{request.cancelLabel}</Text>
                </Touchable>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  return useContext(ConfirmContext);
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.paper,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      ...elevation.lg,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.bodyLg,
      fontWeight: '700',
      color: colors.ink,
      marginBottom: 4,
    },
    message: {
      fontSize: fontSizes.footnote,
      color: colors.smoke,
      marginBottom: spacing.sm,
    },
    option: {
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    optionText: { fontSize: fontSizes.body, color: colors.ink },
    optionDestructive: { color: colors.danger, fontWeight: '600' },
    cancel: {
      marginTop: spacing.md,
      paddingVertical: 13,
      borderRadius: radii.pill,
      backgroundColor: colors.paper2,
      alignItems: 'center',
    },
    cancelText: { fontSize: fontSizes.body, fontWeight: '700', color: colors.smoke },
  });
