import React from 'react';
import { Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
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
  pressedOpacity?: number;
}

// Deliberately smaller than the shortfall would suggest: the chat header
// spaces its buttons 12dp apart, so 6 on each side grows them to ~38dp
// while stopping exactly short of neighbouring slop regions overlapping,
// which would make taps near a boundary hit the wrong button.
const ICON_BUTTON_HIT_SLOP = 6;

export function Touchable({
  style,
  children,
  ripple,
  iconButton = false,
  pressedOpacity = 0.6,
  ...rest
}: TouchableProps) {
  const { colors } = useTheme();

  return (
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
            }
      }
      {...rest}
    >
      {children}
    </Pressable>
  );
}
