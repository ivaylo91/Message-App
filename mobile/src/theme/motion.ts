// The app's motion, in one place - so a button press, a sheet and a
// swipe all feel like the same app, and changing the feel is one edit.
//
// Everything animates through Reanimated, whose springs and timings follow
// the phone's "remove animations" accessibility setting by default
// (ReduceMotion.System): with it on, values jump straight to their end.

// Quick and firm, for things under the finger: a button pressing in, a
// reaction popping, a swiped row settling.
export const SPRING_TAP = { damping: 18, stiffness: 420, mass: 0.6 } as const;

// Softer, for things that arrive: a sheet sliding up, a menu opening.
export const SPRING_SHEET = { damping: 24, stiffness: 260, mass: 0.9 } as const;

// Fades (toasts, pills) - quick enough to never feel like waiting.
export const FADE_MS = 180;
