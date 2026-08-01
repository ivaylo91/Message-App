import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

interface AppLogoProps {
  size?: number;
}

// The same flame mark shown on the Welcome screen, scaled down into a
// small badge for use in screen headers.
export function AppLogo({ size = 28 }: AppLogoProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image
        source={require('../assets/flame-mark.png')}
        style={{ width: size * 0.62, height: size * 0.62 }}
        resizeMode="contain"
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    mark: {
      backgroundColor: colors.ember,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
