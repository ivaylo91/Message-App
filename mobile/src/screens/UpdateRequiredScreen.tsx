import React, { useMemo } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ANDROID_STORE_URL, IOS_STORE_URL } from '../config/env';
import { AppWallpaper } from '../components/AppWallpaper';
import { radii, spacing, ThemeColors } from '../theme/tokens';
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
      <AppWallpaper />
      <View style={styles.content}>
        <Image
          source={require('../assets/flame-mark.png')}
          style={styles.mark}
          resizeMode="contain"
        />
        <Text style={styles.title}>{t('updateRequired.title')}</Text>
        <Text style={styles.subtitle}>{t('updateRequired.subtitle')}</Text>
        <TouchableOpacity style={styles.button} onPress={onUpdate}>
          <Text style={styles.buttonText}>{t('updateRequired.action')}</Text>
        </TouchableOpacity>
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
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.2,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: 15,
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
    buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  });
