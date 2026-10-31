import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import brand from '../../brand.json';
import { themeCss } from '@/ui/theme/tokens';

// A `var(--x)` with no `--x` declared anywhere computes to nothing: a background turns
// transparent and nobody is told. This caught `--surface-2` (used) vs `--surface2` (declared).
const dir = 'src/ui/styles';
const sheets = readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, css: readFileSync(`${dir}/${f}`, 'utf8') }));

describe('design tokens in the stylesheets (--nawy-*)', () => {
  const declared = new Set<string>();
  for (const css of [themeCss(brand), ...sheets.map((s) => s.css)]) {
    for (const m of css.matchAll(/(--nawy-[a-z0-9-]+)\s*:/g)) declared.add(m[1] as string);
  }

  it('every shared token a stylesheet reads is declared', () => {
    const missing: string[] = [];
    for (const { file, css } of sheets) {
      for (const m of css.matchAll(/var\((--nawy-[a-z0-9-]+)/g)) {
        if (!declared.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no stylesheet still uses the old unprefixed names', () => {
    const old =
      /var\(--(bg|surface|surface-2|surface2|text|text-muted|border|accent|accent-fill|on-accent-fill|focus|now|radius|ease|dur|shadow-lift|brand)\b/;
    expect(sheets.filter((s) => old.test(s.css)).map((s) => s.file)).toEqual([]);
  });
});
