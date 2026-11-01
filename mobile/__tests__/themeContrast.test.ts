import {
  AVATAR_PALETTE,
  BUBBLE_GRADIENT_PRESETS,
  darkColors,
  lightColors,
  type ThemeColors,
} from '../src/theme/tokens';

// WCAG 2.2 relative luminance and contrast. Everything here is a solid
// hex: a translucent token's contrast depends on what sits behind it.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

type Role = keyof ThemeColors;

// [foreground, background] pairs the app really draws.
const TEXT_PAIRS: ReadonlyArray<readonly [Role, Role]> = [
  ['ink', 'paper'],
  ['ink', 'paper2'],
  ['ink', 'fill'],
  ['char', 'paper'],
  ['char', 'paper2'],
  ['char', 'amberTint'],
  ['smoke', 'paper'],
  ['smoke', 'paper2'],
  ['smoke', 'fill'],
  ['smoke', 'amberTint'],
  ['emberText', 'paper'],
  ['emberText', 'paper2'],
  ['emberText', 'emberTint'],
  ['danger', 'paper'],
  ['danger', 'paper2'],
  ['danger', 'dangerTint'],
  ['sage', 'paper'],
  ['sage', 'paper2'],
  ['white', 'ember'],
  ['white', 'dangerFill'],
  ['white', 'mutedFill'],
  ['white', 'successFill'],
  ['white', 'callSurface'],
  ['amberText', 'amberTint'],
  ['roseText', 'roseTint'],
  ['tealText', 'tealTint'],
  ['plumText', 'plumTint'],
  ['navText', 'navBar'],
  ['navActiveText', 'navActive'],
  ['navBadgeText', 'navBadge'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme', (_name, colors) => {
  it.each(TEXT_PAIRS)('%s on %s clears AA for text', (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps primary fills visible against the page', () => {
    expect(contrast(colors.ember, colors.paper)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrast(colors.dangerFill, colors.paper)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe('bubble presets', () => {
  describe.each(BUBBLE_GRADIENT_PRESETS.map((preset) => [preset.id, preset] as const))(
    '%s',
    (_id, preset) => {
      it.each(['light', 'dark'] as const)('has readable bubbles in the %s theme', (scheme) => {
        const ink = scheme === 'light' ? lightColors.ink : darkColors.ink;
        // Sent text is a fixed white, so every stop of a gradient must carry it.
        preset[scheme].mine.forEach((stop) => {
          expect(contrast('#FFFFFF', stop)).toBeGreaterThanOrEqual(AA_TEXT);
        });
        preset[scheme].theirs.forEach((stop) => {
          expect(contrast(ink, stop)).toBeGreaterThanOrEqual(AA_TEXT);
        });
      });
    },
  );
});

describe('avatar palette', () => {
  it.each([...AVATAR_PALETTE])('%s carries white initials', (color) => {
    expect(contrast(lightColors.white, color)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
