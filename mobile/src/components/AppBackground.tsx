import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

// A subtle decorative backdrop shown behind every screen: two soft
// ember-toned glows plus a scatter of translucent dots, echoing the
// reference art's sparkle trail but muted enough to sit behind real
// content (lists, text, forms) without hurting readability.
interface Dot {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  size: number;
  color: string;
  opacity: number;
}

const DOTS: Dot[] = [
  { top: 60, right: 36, size: 10, color: colors.ember, opacity: 0.16 },
  { top: 110, right: 84, size: 6, color: colors.clay, opacity: 0.14 },
  { top: 150, right: 48, size: 14, color: colors.emberGlow, opacity: 0.12 },
  { top: 36, right: 130, size: 5, color: colors.sage, opacity: 0.15 },
  { top: 200, right: 100, size: 7, color: colors.dusk, opacity: 0.13 },
  { bottom: 240, left: 24, size: 8, color: colors.clay, opacity: 0.13 },
  { bottom: 180, left: 68, size: 5, color: colors.sage, opacity: 0.15 },
  { bottom: 110, left: 34, size: 12, color: colors.ember, opacity: 0.11 },
  { bottom: 280, left: 96, size: 6, color: colors.dusk, opacity: 0.13 },
  { bottom: 60, left: 108, size: 7, color: colors.clay, opacity: 0.14 },
];

export function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />
      {DOTS.map((dot, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            top: dot.top,
            bottom: dot.bottom,
            left: dot.left,
            right: dot.right,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: dot.color,
            opacity: dot.opacity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowTop: {
    top: -120,
    right: -100,
    width: 320,
    height: 320,
    backgroundColor: colors.emberGlow,
    opacity: 0.12,
  },
  glowBottom: {
    bottom: -140,
    left: -120,
    width: 300,
    height: 300,
    backgroundColor: colors.ember,
    opacity: 0.08,
  },
});