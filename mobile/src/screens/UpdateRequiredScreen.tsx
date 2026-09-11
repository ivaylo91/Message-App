import React, { useMemo } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ANDROID_STORE_URL, IOS_STORE_URL } from '../config/env';
import { Touchable } from '../components/Touchable';
import { fontSizes, radii, spacing, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

// Rendered by RootNavigator in place of the whole app (auth stack
// included) whenever useUpdateGate says the installed version is below
// Remote Config's minimum_supported_version - there's deliberately no
// way to dismiss or navigate past this.
export function UpdateRequiredScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const onUpdate = () => {
    void Linking.openURL(Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../assets/flame-mark.png')}
          style={styles.mark}
          resizeMode="contain"
        />
        <Text style={styles.title}>{t('updateRequired.title')}</Text>
        <Text style={styles.subtitle}>{t('updateRequired.subtitle')}</Text>
        <Touchable style={styles.button} onPress={onUpdate}>
          <Text style={styles.buttonText}>{t('updateRequired.action')}</Text>
        </Touchable>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xxl,
    },
    mark: { width: 56, height: 64, marginBottom: spacing.xl },
    title: {
      fontSize: fontSizes.title,
      fontWeight: '800',
      letterSpacing: -0.2,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: fontSizes.body,
      color: colors.smoke,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: spacing.xl,
      maxWidth: 280,
    },
    button: {
      paddingVertical: 15,
      paddingHorizontal: spacing.xxl,
      borderRadius: radii.lg,
      backgroundColor: colors.ember,
    },
    buttonText: { color: colors.white, fontSize: fontSizes.bodyLg, fontWeight: '700' },
  });
