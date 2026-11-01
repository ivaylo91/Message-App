// Design tokens for Hearth. The layout and type come from the 2026 redesign
// (https://claude.ai/artifact/KvP8ArBKPM69nnjRPVbZuN): white cards, Onest
// throughout. The colour moved on from that redesign's solid violet to match
// the name and the flame: peach paper, one vermilion primary, and four
// supporting tones (amber, rose, teal, plum) that label and tell apart but
// never act - the only thing that says "tap me" is vermilion.
//
// Every foreground/background pair and bubble preset is held to WCAG AA by
// __tests__/themeContrast.test.ts, so a new colour goes in that list too.
//
// Colors come in light/dark pairs (see ThemeContext.tsx for how the active
// one is picked from the system setting) - every other token here
// (spacing, radii, typography) is theme-independent and used as-is.

export interface ThemeColors {
  ink: string;
  paper: string;
  paper2: string;
  ember: string;
  emberGlow: string;
  smoke: string;
  char: string;
  line: string;
  sage: string;
  clay: string;
  dusk: string;
  white: string;
  danger: string;
  // Role tokens, where one colour couldn't serve both jobs. In the dark
  // theme a vermilion light enough to read *as text* on the dark page is too
  // light to carry white text *on top of it*, and the same goes for
  // danger and the muted grey - no single value passes WCAG AA both ways.
  // So `ember`, `danger` and `smoke` stay the colours of text and icons,
  // and these are the fills that sit behind white text.
  emberText: string;
  dangerFill: string;
  mutedFill: string;
  // The redesign's additions. `fill` is the sunken surface (search field,
  // date pills, segmented controls); `emberTint` sits behind emberText
  // (count badges, the video-call button); `online` is the presence dot.
  // The tab bar is an inverse pill - vermilion on the light theme, light on
  // the dark one - so it carries its own colours, including the unread
  // badge, which can't be vermilion where the bar itself is.
  fill: string;
  emberTint: string;
  online: string;
  dangerTint: string;
  navBar: string;
  navActive: string;
  navActiveText: string;
  navText: string;
  navBadge: string;
  navBadgeText: string;
  // Fills behind white text, for the same reason as the role tokens above:
  // `sage` is light enough to read as text on the dark page, so it can't
  // also carry white. The call screen is dark in both themes.
  successFill: string;
  callSurface: string;
  // Supporting tones, always in pairs: *Tint is the surface, *Text the icon
  // or text on it. They identify things (a settings row, a pinned message).
  // Actions stay vermilion, so these must not appear on buttons.
  amberTint: string;
  amberText: string;
  roseTint: string;
  roseText: string;
  tealTint: string;
  tealText: string;
  plumTint: string;
  plumText: string;
}

export const lightColors: ThemeColors = {
  ink: '#2B140B',
  paper: '#FFF3E6',
  paper2: '#FFFFFF',
  ember: '#C8401E',
  emberGlow: '#FF9A6B',
  smoke: '#74503F',
  char: '#4C2A1C',
  line: '#F6DFCB',
  // Green text ('online'); the dot itself is `online`.
  sage: '#1C7040',
  clay: '#B5654A',
  dusk: '#6E7B94',
  white: '#FFF8F2',
  // Was #FF3B30 - the iOS system red, and then a warm brick. With a
  // vermilion primary a warm red reads as just another button, so danger
  // leans the other way, to crimson: it must look like a different kind of
  // thing from the primary, and not only to people who see the two hues
  // apart, which is why every destructive control also has an icon or label.
  danger: '#AD1457',
  emberText: '#A8310F',
  dangerFill: '#AD1457',
  mutedFill: '#7A5546',
  fill: '#FFE7D4',
  emberTint: '#FFE3D3',
  online: '#2F8F4E',
  dangerTint: '#FDE6EE',
  // A step darker than `ember`: small tab labels on it need 4.5:1.
  navBar: '#BC3A1A',
  navActive: '#FFF3E6',
  navActiveText: '#A8310F',
  navText: '#FFF3E6',
  navBadge: '#FFFFFF',
  navBadgeText: '#A8310F',
  successFill: '#1C7040',
  callSurface: '#33160B',
  amberTint: '#FFEBC2',
  amberText: '#7F4A00',
  roseTint: '#FFE3EC',
  roseText: '#A3234F',
  tealTint: '#D5F3EE',
  tealText: '#0B6560',
  plumTint: '#F2E3FC',
  plumText: '#6F2FA0',
};

export const darkColors: ThemeColors = {
  ink: '#FBEFE6',
  paper: '#1C100B',
  paper2: '#2C1A12',
  ember: '#C8401E',
  emberGlow: '#FFB08A',
  smoke: '#CBAE9D',
  char: '#F5E4D8',
  line: 'rgba(255, 220, 195, 0.14)',
  sage: '#7BD09A',
  clay: '#C97A5E',
  dusk: '#7C8CAD',
  white: '#FFF8F2',
  danger: '#FF8AA9',
  emberText: '#FFA27D',
  dangerFill: '#CC2A66',
  mutedFill: '#7A5546',
  fill: '#3A241A',
  emberTint: '#4C2213',
  online: '#3FA463',
  dangerTint: '#47192B',
  navBar: '#FFE4D2',
  navActive: '#1C100B',
  navActiveText: '#FFE4D2',
  navText: '#6E3A26',
  navBadge: '#C8401E',
  navBadgeText: '#FFFFFF',
  successFill: '#1C7040',
  callSurface: '#33160B',
  amberTint: '#43300F',
  amberText: '#FFC766',
  roseTint: '#4A1D2F',
  roseText: '#FF9DBA',
  tealTint: '#123F3B',
  tealText: '#6FE0D2',
  plumTint: '#3B2353',
  plumText: '#D9B3FF',
};

// 'system' defers to the OS setting, which is what this app did
// exclusively before the override existed - and remains the default, so
// an existing install behaves exactly as it did.
export type ThemePreference = 'system' | 'light' | 'dark';

export type ThemeScheme = 'light' | 'dark';

export interface BubbleGradientPair {
  mine: readonly [string, string];
  theirs: readonly [string, string];
}

export interface BubbleGradientPreset {
  id: string;
  light: BubbleGradientPair;
  dark: BubbleGradientPair;
}

// Each preset pairs a vivid "mine" gradient with a soft pastel "theirs"
// tint in the same hue family, in both light/dark forms - "theirs" is a
// soft pastel in light mode (dark ink text reads fine on it) and a deep
// muted tint in dark mode (so it still needs light ink text; see
// bubbleTextTheirs in ChatScreen, which just uses colors.ink and gets
// the right contrast in both cases for free). "mine" has to stay dark/
// saturated enough for the fixed white bubbleTextMine to read on it - at
// *both* stops, in both themes, which is why the dark forms reuse the light
// "mine" rather than brightening it: several presets used to, and their
// sent messages were white on sky blue.
// The first entry ("hearth", vermilion) is the default - see ThemeContext
// for how the user's chosen preset is applied.
export const BUBBLE_GRADIENT_PRESETS: BubbleGradientPreset[] = [
  // The default: a low vermilion gradient for mine, a plain card for theirs.
  {
    id: 'hearth',
    light: { mine: ['#CC4520', '#B8341C'], theirs: ['#FFFFFF', '#FFFFFF'] },
    dark: { mine: ['#CC4520', '#B8341C'], theirs: ['#3A241A', '#3A241A'] },
  },
  {
    id: 'ember',
    light: { mine: ['#C92A63', '#7C3AED'], theirs: ['#FCE0EC', '#E4DCFB'] },
    dark: { mine: ['#C92A63', '#7C3AED'], theirs: ['#4A2338', '#382558'] },
  },
  {
    id: 'ocean',
    light: { mine: ['#1C74A8', '#1E5FBF'], theirs: ['#DDF1FC', '#DCE7FB'] },
    dark: { mine: ['#1C74A8', '#1E5FBF'], theirs: ['#1E3A4A', '#22345C'] },
  },
  {
    id: 'sunset',
    light: { mine: ['#B8500F', '#CC2C66'], theirs: ['#FFEBDD', '#FCE0EC'] },
    dark: { mine: ['#B8500F', '#CC2C66'], theirs: ['#4A2E1E', '#4A2338'] },
  },
  {
    id: 'forest',
    light: { mine: ['#2B8552', '#1F7A52'], theirs: ['#E1F5E9', '#DCEFE2'] },
    dark: { mine: ['#2B8552', '#1F7A52'], theirs: ['#1E3B2B', '#1C3324'] },
  },
  {
    id: 'berry',
    light: { mine: ['#C2338F', '#7C2D9E'], theirs: ['#FBE1F1', '#F0DCF7'] },
    dark: { mine: ['#C2338F', '#7C2D9E'], theirs: ['#442038', '#3A2350'] },
  },
  {
    id: 'midnight',
    light: { mine: ['#5F6C85', '#2C3550'], theirs: ['#E5E8EF', '#DEE1EB'] },
    dark: { mine: ['#5F6C85', '#2C3550'], theirs: ['#262B3A', '#20263A'] },
  },
  // The solid violet of the 2026 redesign, kept for anyone who liked it.
  {
    id: 'violet',
    light: { mine: ['#6D35E8', '#6D35E8'], theirs: ['#FFFFFF', '#FFFFFF'] },
    dark: { mine: ['#6D35E8', '#6D35E8'], theirs: ['#3A241A', '#3A241A'] },
  },
];

export const DEFAULT_BUBBLE_GRADIENT_ID = BUBBLE_GRADIENT_PRESETS[0].id;

// Initials avatars. Fixed rather than themed: each carries white initials
// and clears 4.5:1 under them on either theme.
export const AVATAR_PALETTE = [
  '#C2410C',
  '#BE3A6B',
  '#A85F0C',
  '#0F7C78',
  '#3F6FB5',
  '#8E44AD',
  '#567A1A',
] as const;

export function avatarColorFor(seed: string, _colors?: ThemeColors): string {
  const avatarPalette: readonly string[] = AVATAR_PALETTE;
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

// For text in fixed-size containers - badges, tab labels, chips, the time
// on a row - which overflow their shape at the largest system font sizes.
// They still grow by up to 30%; running text (messages, names, previews)
// is never capped and scales fully with the phone's setting.
export const MAX_FONT_SCALE_TIGHT = 1.3;

// Onest, the app's one typeface - modern, slightly rounded, with full
// Cyrillic. Bundled in five weights (400-800) and registered as a single
// family, so styles set `fontFamily: fonts.family` and pick the weight
// with fontWeight as usual (Android: res/font/onest.xml; iOS: by family).
export const fonts = {
  family: 'Onest',
} as const;

export const radii = {
  sm: 8,
  md: 13,
  lg: 16,
  xl: 20,
  // Message bubbles. Larger than xl and used only here, but it was
  // hardcoded as 22 in ChatScreen, which put the app's most repeated
  // shape outside the scale. Most other raw radii in the app are a
  // circle's size/2 and correctly stay literal.
  bubble: 22,
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

// Raised surfaces. The app previously used shadows in three places and
// separated everything else with hairline borders, which reads flat.
// These are deliberately restrained - a shadow's job here is to say
// "this floats above the content", not to be visible in itself.
//
// Only applied to surfaces that own an opaque background: on Android
// `elevation` needs one to cast a shadow at all. The chat header and
// composer deliberately keep their hairlines instead, because they are
// translucent over the chat wallpaper by design.
//
// Tinted a deep umber rather than black: a neutral shadow on peach paper
// reads as a grey smudge.
const SHADOW_COLOR = '#5A2410';

export const elevation = {
  sm: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  lg: {
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
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

// The type ramp. This replaces a `typography` token that was defined here
// but never imported anywhere, which is how 19 distinct font sizes - half
// of them on half-point values like 13.5 and 15.5 - ended up spread across
// 107 style declarations. Half points don't render distinguishably anyway;
// what they cost is a consistent rhythm and any single place to adjust it.
//
// Seven steps, each mapped from the sizes that were previously in use:
//
//   micro    9.5, 10, 10.5      badges, timestamps, the edited tag
//   caption  11, 11.5, 12, 12.5 labels, hints, chips
//   footnote 13, 13.5           secondary rows, previews
//   body     14, 14.5, 15, 15.5 message text, inputs, list titles
//   bodyLg   16, 17             emphasised body, modal titles
//   title    20, 22             screen titles on sub-screens
//   display  28                 the conversation list header
//   hero     40                 the welcome screen wordmark
//
// Line heights are deliberately not part of this yet: adding them would
// shift vertical rhythm inside fixed-height rows (badges, chips, the tab
// bar) and that needs looking at on a device, not inferring. Worth doing
// as a follow-up - no message body currently sets one.
export const fontSizes = {
  micro: 10,
  caption: 12,
  footnote: 13,
  body: 15,
  bodyLg: 17,
  title: 22,
  display: 28,
  hero: 40,
} as const;
