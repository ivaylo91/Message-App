import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { Icon } from '../components/Icon';
import { Touchable } from '../components/Touchable';
import { useContentWidth } from '../hooks/useContentWidth';
import { fonts, fontSizes, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

// The illustration is drawn on a fixed 342 x 330 board (a 390-wide phone
// less its gutters) and scaled down to fit narrower screens.
const BOARD_WIDTH = 342;
const BOARD_HEIGHT = 330;

// People around the flame - initials only, in the avatar palette.
const PEOPLE = [
  { left: 30, top: 60, size: 64, color: '#B4532F' },
  { left: 262, top: 40, size: 56, color: '#2D7A73' },
  { left: 270, top: 210, size: 68, color: '#56677F' },
  { left: 40, top: 232, size: 52, color: '#8A3F7A' },
] as const;

export function WelcomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useContentWidth();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const boardScale = Math.min(1, (Math.min(width, contentWidth) - spacing.xl * 2) / BOARD_WIDTH);
  const initials = t('welcome.sampleInitials').split(' ');

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.glow} pointerEvents="none" />
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        {/* Decorative: a group gathering round the flame. */}
        <View
          style={[styles.boardSlot, { height: BOARD_HEIGHT * boardScale }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View style={[styles.board, { transform: [{ scale: boardScale }] }]}>
            <View style={styles.flameTile}>
              <Image
                source={require('../assets/flame-mark.png')}
                style={styles.flameGlyph}
                resizeMode="contain"
              />
            </View>
            {PEOPLE.map((person, i) => (
              <View
                key={i}
                style={[
                  styles.person,
                  {
                    left: person.left,
                    top: person.top,
                    width: person.size,
                    height: person.size,
                    borderRadius: person.size / 2,
                    backgroundColor: person.color,
                  },
                ]}
              >
                <Text style={[styles.personText, { fontSize: Math.round(person.size * 0.3) }]}>
                  {initials[i] ?? ''}
                </Text>
              </View>
            ))}
            <View style={[styles.bubble, styles.bubbleTheirs]}>
              <Text style={styles.bubbleTextTheirs}>{t('welcome.bubbleOne')}</Text>
            </View>
            <View style={[styles.bubble, styles.bubbleMine]}>
              <Text style={styles.bubbleTextMine}>{t('welcome.bubbleTwo')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.copy}>
          <Text style={styles.wordmark} accessibilityRole="header">
            Hearth
          </Text>
          <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
          <Text style={styles.subline}>{t('welcome.subline')}</Text>
        </View>

        <View style={styles.actions}>
          <Touchable
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t('welcome.getStarted')}</Text>
            <Icon name="arrow-right" size={20} color="#FFFFFF" />
          </Touchable>
          <Touchable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{t('welcome.haveAccount')}</Text>
          </Touchable>
        </View>

        <Text style={styles.footer}>{t('welcome.copyright')}</Text>
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
      paddingHorizontal: spacing.xl,
      overflow: 'hidden',
    },
    // A wash of violet behind the illustration, bleeding off the top.
    glow: {
      position: 'absolute',
      width: 560,
      height: 560,
      borderRadius: 280,
      top: -170,
      left: -85,
      backgroundColor: colors.emberTint,
    },
    content: { flex: 1, width: '100%' },
    boardSlot: { width: '100%', alignItems: 'center', marginTop: spacing.sm },
    board: { width: BOARD_WIDTH, height: BOARD_HEIGHT, transformOrigin: 'top' },
    flameTile: {
      position: 'absolute',
      left: 131,
      top: 105,
      width: 96,
      height: 96,
      borderRadius: 32,
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.ember,
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 18 },
      elevation: 10,
    },
    flameGlyph: { width: 46, height: 53 },
    person: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: colors.paper,
    },
    personText: { fontFamily: fonts.family, fontWeight: '700', color: '#FFFFFF' },
    bubble: {
      position: 'absolute',
      paddingVertical: 10,
      paddingHorizontal: 14,
      shadowColor: '#1C1613',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    bubbleTheirs: {
      left: 92,
      top: 30,
      backgroundColor: colors.paper2,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomLeftRadius: 6,
    },
    bubbleMine: {
      left: 150,
      top: 262,
      backgroundColor: colors.ember,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 6,
      borderBottomLeftRadius: 18,
    },
    bubbleTextTheirs: { fontFamily: fonts.family, fontSize: 14, fontWeight: '500', color: colors.ink },
    bubbleTextMine: { fontFamily: fonts.family, fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
    spacer: { flex: 1, minHeight: spacing.xl },
    copy: { gap: spacing.md },
    wordmark: {
      fontFamily: fonts.family,
      fontSize: 44,
      lineHeight: 46,
      fontWeight: '800',
      letterSpacing: -1.3,
      color: colors.ink,
    },
    tagline: {
      fontFamily: fonts.family,
      fontSize: fontSizes.title,
      lineHeight: 29,
      fontWeight: '500',
      letterSpacing: -0.2,
      color: colors.char,
    },
    subline: { fontFamily: fonts.family, fontSize: fontSizes.body, lineHeight: 22, color: colors.smoke },
    actions: { gap: 10, marginTop: spacing.xxl },
    primaryButton: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.ember,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    primaryButtonText: { fontFamily: fonts.family, color: '#FFFFFF', fontSize: fontSizes.bodyLg, fontWeight: '600' },
    secondaryButton: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.paper2,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: { fontFamily: fonts.family, color: colors.ink, fontSize: fontSizes.bodyLg, fontWeight: '600' },
    footer: {
      fontFamily: fonts.family,
      marginTop: spacing.lg,
      textAlign: 'center',
      color: colors.smoke,
      fontSize: fontSizes.caption,
    },
  });
