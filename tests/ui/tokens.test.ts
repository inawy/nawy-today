import { describe, expect, it } from 'vitest';
import {
  CALENDAR_COLOR_IDS,
  LIGHT,
  calendarColor,
  darkTokens,
  mix,
  themeCss,
} from '@/ui/theme/tokens';
import type { ThemeName } from '@/ui/theme/tokens';
import brand from '../../brand.json';

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes: [ThemeName, ReturnType<typeof darkTokens>][] = [
  ['light', LIGHT],
  ['dark', darkTokens(brand)],
];

describe('contrast helper', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});

describe.each(themes)('%s theme contrast (WCAG AA)', (name, t) => {
  it('body and muted text are readable on every surface they sit on', () => {
    for (const bg of [t.bg, t.surface, t.surface2]) {
      expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent text and filled accent buttons are readable', () => {
    for (const bg of [t.bg, t.surface, t.surface2]) {
      expect(contrast(t.accent, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t.onAccentFill, t.accentFill)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus ring and the now line stand out from the surface (3:1 for graphics)', () => {
    expect(contrast(t.focus, t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.now, t.surface)).toBeGreaterThanOrEqual(3);
  });

  it('every calendar colour: bar is visible on the surface, text is readable on its chip', () => {
    for (const id of CALENDAR_COLOR_IDS) {
      const c = calendarColor(id, name, brand);
      expect(contrast(c.bar, t.surface), `${id} bar`).toBeGreaterThanOrEqual(3);
      expect(contrast(t.text, c.bg), `${id} chip text`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('brand', () => {
  it('uses the exact brand accent as the dark-theme fill and exposes it as --brand', () => {
    expect(darkTokens(brand).accentFill).toBe(brand.accent);
    expect(themeCss(brand)).toContain(`--brand: ${brand.accent};`);
  });

  it('is the Nawy blue from D-011', () => {
    expect(brand.accent).toBe('#3D7BFF');
  });
});

describe('themeCss', () => {
  const css = themeCss(brand);

  it('defines light by default, dark by OS preference and by explicit data-theme', () => {
    expect(css).toContain(':root {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-theme='light'])");
    expect(css).toContain(":root[data-theme='dark']");
  });

  it('defines every token and calendar colour in both themes', () => {
    for (const v of ['--bg', '--surface', '--text', '--accent-fill', '--on-accent-fill', '--now']) {
      expect(css.split(`${v}:`).length - 1).toBe(3); // light, dark-by-media, dark-explicit
    }
    for (const id of CALENDAR_COLOR_IDS) {
      expect(css).toContain(`--cal-${id}-bar:`);
      expect(css).toContain(`--cal-${id}-bg:`);
    }
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#FF0000', '#0000FF', 1)).toBe('#FF0000');
    expect(mix('#FF0000', '#0000FF', 0)).toBe('#0000FF');
  });
});
