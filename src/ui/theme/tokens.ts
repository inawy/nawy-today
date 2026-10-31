// Design tokens (D-011). Pure data + a CSS generator: no imports, so the Vite config, the tests
// and the app all read the SAME values. The brand accent comes from brand.json (one source).
//
// Contrast is not a promise in a comment: tests/ui/tokens.test.ts computes WCAG ratios for every
// text/background and bar/surface pair below and fails the build under 4.5:1 (text) / 3:1 (bars).

export interface Brand {
  readonly accent: string;
}

export type ThemeName = 'light' | 'dark';

export interface ThemeTokens {
  readonly bg: string;
  readonly surface: string;
  readonly surface2: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  /** Accent used as TEXT or icon on `surface`. */
  readonly accent: string;
  /** Accent used as a FILL (buttons, selection), with `onAccentFill` as its text colour. */
  readonly accentFill: string;
  readonly onAccentFill: string;
  readonly focus: string;
  /** The red "now" line. */
  readonly now: string;
}

export const LIGHT: ThemeTokens = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F5F7FA',
  text: '#171B22',
  textMuted: '#4B5563',
  border: '#E3E7EE',
  accent: '#2B5FD9', // a deeper step of the brand blue: the brand itself is 3.8:1 on white
  accentFill: '#2B5FD9',
  onAccentFill: '#FFFFFF',
  focus: '#2B5FD9',
  now: '#D32F2F',
};

export function darkTokens(brand: Brand): ThemeTokens {
  return {
    bg: '#0F1319',
    surface: '#151A22',
    surface2: '#1C222C',
    text: '#E8ECF2',
    textMuted: '#A3ADBD',
    border: '#262D39',
    accent: '#6C9CFF',
    accentFill: brand.accent, // the exact brand blue, with dark text on it (white would be 3.8:1)
    onAccentFill: '#06122B',
    focus: '#6C9CFF',
    now: '#FF6B6B',
  };
}

export const CALENDAR_COLOR_IDS = [
  'blue',
  'red',
  'green',
  'amber',
  'purple',
  'teal',
  'pink',
  'gray',
] as const;
export type CalendarColorId = (typeof CALENDAR_COLOR_IDS)[number];

const BARS: Record<CalendarColorId, { light: string; dark: string }> = {
  blue: { light: '#3D7BFF', dark: '#6C9CFF' },
  red: { light: '#D93F3F', dark: '#FF7B7B' },
  green: { light: '#1E9E5A', dark: '#4CCB86' },
  amber: { light: '#C77700', dark: '#F5B342' },
  purple: { light: '#8A5CF6', dark: '#B79BFF' },
  teal: { light: '#0F9AA8', dark: '#4CCAD6' },
  pink: { light: '#D6417F', dark: '#FF86B3' },
  gray: { light: '#687385', dark: '#A3ADBD' },
};

/** `fg` over `bg` at `alpha` (0…1), as #RRGGBB. */
export function mix(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const part = (i: number): string =>
    Math.round(alpha * ch(fg, i) + (1 - alpha) * ch(bg, i))
      .toString(16)
      .padStart(2, '0');
  return `#${part(0)}${part(1)}${part(2)}`.toUpperCase();
}

/** Bar colour (left edge / dot) and the tinted chip background for a palette colour. */
export function calendarColor(id: CalendarColorId, theme: ThemeName, brand: Brand) {
  const surface = theme === 'light' ? LIGHT.surface : darkTokens(brand).surface;
  const bar = BARS[id][theme];
  return { bar, bg: mix(bar, surface, theme === 'light' ? 0.16 : 0.22) };
}

const kebab = (s: string): string =>
  s.replace(/([a-z])(\d)/g, '$1-$2').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(theme: ThemeName, brand: Brand): string {
  const tokens = theme === 'light' ? LIGHT : darkTokens(brand);
  const lines = Object.entries(tokens).map(([k, v]) => `  --nawy-color-${kebab(k)}: ${v};`);
  for (const id of CALENDAR_COLOR_IDS) {
    const c = calendarColor(id, theme, brand);
    lines.push(`  --cal-${id}-bar: ${c.bar};`, `  --cal-${id}-bg: ${c.bg};`);
  }
  lines.push(`  color-scheme: ${theme};`);
  return lines.join('\n');
}

/** The whole theme as a stylesheet: light by default, dark by OS preference or `data-theme`. */
export function themeCss(brand: Brand): string {
  return [
    `:root {\n  --nawy-color-brand: ${brand.accent};\n${declarations('light', brand)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${declarations(
      'dark',
      brand,
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')}\n  }\n}`,
    `:root[data-theme='dark'] {\n${declarations('dark', brand)}\n}`,
    '',
  ].join('\n');
}
