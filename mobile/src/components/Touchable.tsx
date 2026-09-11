import React, { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import type { PressableProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// The app used TouchableOpacity everywhere (82 elements). It only fades
// opacity, which is why every tap felt the same and slightly dated: no
// Android ripple, and no way to express a pressed state beyond a global
// fade. Pressable is the current primitive but takes a bit of ceremony to
// use well, so this wraps it once with the platform-correct defaults
// instead of repeating them at 82 call sites.
//
// Ripple on Android, opacity on iOS - deliberately not both. A ripple is
// what Android users expect for a press, and stacking a fade on top of it
// makes the surface look like it's disappearing rather than responding.
//
// colors.line doubles as the ripple colour: it is already the theme's
// "faint contrast against the current surface" value in both schemes
// (a translucent ink in light, translucent white in dark), which is
// exactly what a ripple needs.
interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  // Pass null for surfaces that shouldn't ripple at all.
  ripple?: { color?: string; borderless?: boolean } | null;
  // An icon-only button: the ripple goes borderless (a rectangular one
  // draws a box around a circular target) and the touch area grows past
  // the glyph. The chat header's buttons are 18px icons with 4px of
  // padding - about 26dp against a 44-48dp platform guideline - so they
  // were noticeably easy to miss.
  iconButton?: boolean;
  // Springs the target down slightly while held. Opt-in rather than
  // default because it wraps the element in an extra Animated.View, which
  // could disturb layout in a flex row - it suits fixed-size primary
  // actions like the send button, not list rows.
  pressScale?: boolean;
  pressedOpacity?: number;
}

// Deliberately smaller than the shortfall would suggest: the chat header
// spaces its buttons 12dp apart, so 6 on each side grows them to ~38dp
// while stopping exactly short of neighbouring slop regions overlapping,
// which would make taps near a boundary hit the wrong button.
const ICON_BUTTON_HIT_SLOP = 6;

const PRESS_SCALE = 0.92;

export function Touchable({
  style,
  children,
  ripple,
  iconButton = false,
  pressScale = false,
  pressedOpacity = 0.6,
  ...rest
}: TouchableProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        friction: 6,
        tension: 260,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const onPressIn = useCallback(
    (event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      if (pressScale) springTo(PRESS_SCALE);
      rest.onPressIn?.(event);
    },
    [pressScale, springTo, rest],
  );

  const onPressOut = useCallback(
    (event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      if (pressScale) springTo(1);
      rest.onPressOut?.(event);
    },
    [pressScale, springTo, rest],
  );

  const pressable = (
    <Pressable
      hitSlop={iconButton ? ICON_BUTTON_HIT_SLOP : undefined}
      style={({ pressed }) => [
        style,
        // Android gets the ripple instead, so it is excluded here.
        pressed && Platform.OS !== 'android' ? { opacity: pressedOpacity } : null,
      ]}
      android_ripple={
        ripple === null
          ? undefined
          : {
              color: ripple?.color ?? colors.line,
              borderless: ripple?.borderless ?? iconButton,
              // Draw the ripple over the content, not under it. Without
              // this, React Native applies it as nativeBackgroundAndroid -
              // which *replaces* the view's background drawable, so any
              // backgroundColor is silently lost. Combined with borderless
              // (no mask) that made the send button completely invisible: a
              // white icon on light paper, its ember circle gone. Applies to
              // every button with a background, so it is unconditional here
              // rather than a per-site opt-in. Needs API 23+; minSdk is 24.
              foreground: true,
            }
      }
      {...rest}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      {children}
    </Pressable>
  );

  if (!pressScale) return pressable;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>{pressable}</Animated.View>
  );
}
