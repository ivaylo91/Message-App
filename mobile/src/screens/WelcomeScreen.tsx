import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { AppWallpaper } from '../components/AppWallpaper';
import { useContentWidth } from '../hooks/useContentWidth';
import { radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <AppWallpaper />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        <View style={styles.mark}>
          <Image
            source={require('../assets/flame-mark.png')}
            style={styles.markGlyph}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.wordmark}>Hearth</Text>
        <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.primaryButtonText}>{t('welcome.getStarted')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.secondaryButtonText}>{t('welcome.haveAccount')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.paper,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl,
    },
    content: {
      width: '100%',
      alignItems: 'center',
      gap: spacing.lg,
    },
    mark: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.ember,
      shadowOpacity: 0.5,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    markGlyph: {
      width: 48,
      height: 55,
    },
    wordmark: {
      fontSize: 40,
      fontWeight: '800',
      letterSpacing: -0.5,
      color: colors.ink,
    },
    tagline: {
      color: colors.smoke,
      fontSize: 15.5,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 220,
    },
    actions: {
      width: '100%',
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    primaryButton: {
      width: '100%',
      paddingVertical: 15,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.ember,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 15.5,
      fontWeight: '700',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.ink,
      fontSize: 14.5,
      fontWeight: '600',
      opacity: 0.7,
    },
  });