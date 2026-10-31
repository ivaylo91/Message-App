import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOutbox } from '../offline/OutboxContext';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { announce } from '../utils/announce';

// Renders nothing while online. A state rather than an error - messages queue
// and send on their own - so it stays out of the red the app keeps for
// destructive actions.
export function OfflineBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { isOnline } = useOutbox();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (!isOnline) announce(t('chat.offlineBanner'));
  }, [isOnline, t]);

  if (isOnline) return null;
  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.text}>{t('chat.offlineBanner')}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.fill,
      alignItems: 'center',
    },
    text: {
      fontFamily: fonts.family,
      color: colors.char,
      fontSize: fontSizes.caption,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
