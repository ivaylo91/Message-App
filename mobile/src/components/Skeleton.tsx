import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import type { DimensionValue } from 'react-native';
import { radii, ThemeColors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

// Placeholder shapes for content that is on its way, instead of a
// spinner on empty space. A spinner says "something is happening"; a
// skeleton says "this is what is coming, and roughly how much" - which
// makes the same wait feel shorter, and stops the layout jumping when
// the real content lands.
//
// Split in two on purpose: Skeleton is a static block, and SkeletonGroup
// runs the pulse for everything inside it. A loading conversation list is
// ~30 blocks, and giving each one its own Animated loop would mean 30
// animations to say one thing. One per loading surface, and they stay in
// step with each other rather than shimmering independently.
export function Skeleton({
  width,
  height,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.block, { width, height, borderRadius: radius }, style]} />
  );
}

const PULSE_MS = 900;

export function SkeletonGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        style,
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) },
      ]}
      // A placeholder has nothing to announce; the screen it belongs to
      // reports its own loading state.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // `line` is the theme's faint-contrast-on-current-surface value, which
    // is what a placeholder wants in both schemes.
    block: { backgroundColor: colors.line },
  });
