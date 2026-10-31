import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary as SentryErrorBoundary } from '@sentry/react-native';
import i18n from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { Touchable } from './Touchable';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';

// The root boundary sits above everything, including whatever sets up
// translations, so it has to be able to speak without them.
const FALLBACK_COPY = {
  title: 'Something went wrong',
  message: 'This part of the app stopped working.',
  retry: 'Try again',
  back: 'Go back',
};

function copy(key: keyof typeof FALLBACK_COPY): string {
  return i18n.isInitialized ? i18n.t(`errorBoundary.${key}`) : FALLBACK_COPY[key];
}

function ErrorFallback({
  onRetry,
  showBack,
}: {
  onRetry: () => void;
  showBack: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canGoBack = showBack && navigationRef.isReady() && navigationRef.canGoBack();

  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={styles.title} accessibilityRole="header">
        {copy('title')}
      </Text>
      <Text style={styles.message}>{copy('message')}</Text>
      <Touchable style={styles.primary} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.primaryText}>{copy('retry')}</Text>
      </Touchable>
      {canGoBack && (
        <Touchable
          style={styles.secondary}
          onPress={() => navigationRef.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{copy('back')}</Text>
        </Touchable>
      )}
    </View>
  );
}

// Keeps a render error to the part of the app it happened in, instead of the
// whole app going blank, and reports it. One wraps the app and one wraps each
// screen, so a broken chat leaves the tab bar and every other screen working.
// `showBack` is for those screens: if retrying fails too, there's a way out.
export function ErrorBoundary({
  children,
  showBack = false,
}: {
  children: React.ReactNode;
  showBack?: boolean;
}) {
  return (
    <SentryErrorBoundary
      fallback={({ resetError }) => <ErrorFallback onRetry={resetError} showBack={showBack} />}
    >
      {children}
    </SentryErrorBoundary>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xxl,
      backgroundColor: colors.paper,
    },
    title: {
      fontFamily: fonts.family,
      fontSize: fontSizes.title,
      fontWeight: '800',
      textAlign: 'center',
      color: colors.ink,
    },
    message: {
      fontFamily: fonts.family,
      fontSize: fontSizes.body,
      textAlign: 'center',
      color: colors.smoke,
    },
    primary: {
      marginTop: spacing.md,
      minHeight: 48,
      paddingHorizontal: spacing.xl,
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: colors.ember,
    },
    primaryText: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '700', color: '#FFFFFF' },
    secondary: { minHeight: 44, paddingHorizontal: spacing.xl, justifyContent: 'center' },
    secondaryText: { fontFamily: fonts.family, fontSize: fontSizes.body, fontWeight: '600', color: colors.emberText },
  });
