import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { Touchable } from '../components/Touchable';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import {
  disableAppLock,
  enableAppLock,
  hideFromRecents,
  isAppLockEnabled,
  shouldLockOnReturn,
  unlockApp,
} from './appLock';

interface AppLockContextValue {
  isEnabled: boolean;
  // Resolves with whether the change took effect.
  setEnabled: (enabled: boolean) => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextValue>({
  isEnabled: false,
  setEnabled: async () => false,
});

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { userId, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Null until read, and treated as locked: the chats must never show for a
  // moment on the way to the lock screen.
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  // Drawn as the app leaves, so it's already there on the way back. Deciding to
  // lock only on return leaves the chats showing until the cover arrives.
  const [isAway, setIsAway] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const isPromptingRef = useRef(false);
  const previousUserIdRef = useRef(userId);

  useEffect(() => {
    void isAppLockEnabled().then(setIsEnabled);
  }, []);

  useEffect(() => {
    hideFromRecents(Boolean(isEnabled));
  }, [isEnabled]);

  // A lock belongs to the person who set it, not to whoever signs in next.
  useEffect(() => {
    if (previousUserIdRef.current && !userId) {
      void disableAppLock().catch(() => {});
      setIsEnabled(false);
    }
    previousUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAtRef.current = Date.now();
        setIsAway(true);
      } else if (next === 'active') {
        if (shouldLockOnReturn(backgroundedAtRef.current, Date.now())) setIsLocked(true);
        backgroundedAtRef.current = null;
        setIsAway(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const covered = Boolean(userId) && (isEnabled === null || (isEnabled && (isLocked || isAway)));
  const canPrompt = Boolean(userId) && Boolean(isEnabled) && isLocked && !isAway;

  const onUnlock = useCallback(async () => {
    if (isPromptingRef.current) return;
    isPromptingRef.current = true;
    const unlocked = await unlockApp(t('appLock.promptTitle'));
    isPromptingRef.current = false;
    if (unlocked) {
      // A slow PIN entry counts as time away; don't relock for it.
      backgroundedAtRef.current = null;
      setIsLocked(false);
    }
  }, [t]);

  useEffect(() => {
    if (canPrompt) void onUnlock();
  }, [canPrompt, onUnlock]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        await disableAppLock();
        setIsEnabled(false);
        return true;
      }
      const turnedOn = await enableAppLock(t('appLock.promptTitle'));
      if (turnedOn) {
        backgroundedAtRef.current = null;
        setIsLocked(false);
        setIsEnabled(true);
      }
      return turnedOn;
    },
    [t],
  );

  const value = useMemo(
    () => ({ isEnabled: Boolean(isEnabled), setEnabled }),
    [isEnabled, setEnabled],
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {/* A Modal, so it also covers any sheet or viewer left open. Back does
          nothing: there's nowhere to go from here. */}
      <Modal
        visible={covered}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.cover}>
          {isEnabled && isLocked && (
            <>
              <View style={styles.tile}>
                <Image
                  source={require('../assets/flame-mark.png')}
                  style={styles.flame}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {t('appLock.lockedTitle')}
              </Text>
              <Touchable style={styles.primary} onPress={() => void onUnlock()} accessibilityRole="button">
                <Text style={styles.primaryText}>{t('appLock.unlock')}</Text>
              </Touchable>
              {/* The way out if the phone's own unlock stops working. Sign-in
                  still needs the password, so this gives nothing away. */}
              <Touchable
                style={styles.secondary}
                onPress={() => void logout().catch(() => {})}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>{t('footer.logoutConfirm')}</Text>
              </Touchable>
            </>
          )}
        </View>
      </Modal>
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  return useContext(AppLockContext);
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cover: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.xxl,
      backgroundColor: colors.paper,
    },
    tile: {
      width: 96,
      height: 96,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.ember,
    },
    flame: { width: 46, height: 53 },
    title: {
      marginTop: spacing.sm,
      fontFamily: fonts.family,
      fontSize: fontSizes.title,
      fontWeight: '800',
      textAlign: 'center',
      color: colors.ink,
    },
    primary: {
      marginTop: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.xxl,
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: colors.ember,
    },
    primaryText: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '700', color: '#FFFFFF' },
    secondary: { minHeight: 44, paddingHorizontal: spacing.xl, justifyContent: 'center' },
    secondaryText: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '600', color: colors.emberText },
  });
