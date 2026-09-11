import { Platform, Vibration } from 'react-native';

// Deliberately built on React Native's core Vibration rather than a
// haptics library, so this adds no native module: the app has twice
// migrated off deprecated packages and a dependency is not free.
//
// The honest trade-off: this is a short buzz, not a refined tick. Android
// has VibrationEffect.createPredefined(EFFECT_CLICK) and iOS has the
// Taptic Engine, and core Vibration reaches neither - it takes a duration
// and nothing else. On Android, which is the only platform this app
// currently ships, a 10-20ms pulse reads as a tick and is what a lot of
// apps actually do.
//
// Everything routes through this one module so swapping in
// react-native-haptic-feedback later is a single file, not a hunt through
// call sites. That is the main reason it exists at all rather than
// Vibration.vibrate being called inline.
//
// iOS is skipped outright: Vibration.vibrate there triggers the full
// notification buzz regardless of the duration passed, which is far too
// heavy for a keystroke-level confirmation and worse than no feedback.

const DURATIONS = {
  // Sending, confirming, committing something.
  tap: 12,
  // Long-press landing - the moment a menu or picker appears.
  press: 18,
  // A reaction going on or off.
  select: 10,
} as const;

export type HapticKind = keyof typeof DURATIONS;

export function haptic(kind: HapticKind): void {
  if (Platform.OS !== 'android') return;
  try {
    Vibration.vibrate(DURATIONS[kind]);
  } catch {
    // Never worth failing an interaction over. A device with no vibrator,
    // or one where the user has disabled it, simply gets nothing.
  }
}
