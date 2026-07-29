// Design tokens for Hearth, matching the ember/hearth palette from the
// design review (https://claude.ai/code/artifact/c8ef954b-9c38-4fb4-b9f5-0d0d620f0e2a).

export const colors = {
  ink: '#1C1310',
  paper: '#FBF3EA',
  paper2: '#FFFFFF',
  ember: '#E8622C',
  emberGlow: '#FF9A56',
  smoke: '#8A776D',
  char: '#2A1E19',
  line: 'rgba(28, 19, 16, 0.09)',
  sage: '#7C8F6E',
  clay: '#B5654A',
  dusk: '#6E7B94',
  white: '#FFF8F2',
  danger: '#FF3B30',
  sand: '#F3E3D0',
} as const;

export const avatarPalette = [colors.clay, colors.sage, colors.dusk] as const;

export function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const radii = {
  sm: 8,
  md: 13,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Caps how wide a screen's content is allowed to stretch. Phones are
// narrower than this and are unaffected; on tablets it keeps text lines,
// forms, and chat bubbles at a readable width instead of spanning the
// full display.
export const MAX_CONTENT_WIDTH = 480;

// Caps chat bubble width in absolute pixels rather than a percentage of
// the screen, so bubbles stay readable on tablets instead of stretching
// to 80% of a much wider display.
export const MAX_BUBBLE_WIDTH = 340;

export const typography = {
  display: {
    fontWeight: '800' as const,
    letterSpacing: -0.3,
  },
  body: {
    fontWeight: '400' as const,
  },
  label: {
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};