import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/base.css', 'utf8');

describe('bundled Arabic font', () => {
  const files = [...css.matchAll(/url\('\/(fonts\/[^']+)'\)/g)].map((m) => m[1] as string);

  it('declares regular and bold faces from the app itself', () => {
    expect(files).toHaveLength(2);
    expect(css).toMatch(/font-weight: 400/);
    expect(css).toMatch(/font-weight: 700/);
    expect(css).not.toMatch(/url\(['"]?https?:/);
  });

  it('ships every declared file, and its licence, in public/', () => {
    for (const f of files) expect(existsSync(`public/${f}`), f).toBe(true);
    expect(existsSync('public/fonts/OFL-IBM-Plex-Sans-Arabic.txt')).toBe(true);
  });

  it('puts the bundled font first and keeps system fallbacks', () => {
    const stack = /:root \{[^}]*?font-family:([^;]+);/s.exec(css)?.[1] ?? '';
    expect(stack.trim().startsWith("'Nawy Sans'")).toBe(true);
    expect(stack).toContain('system-ui');
  });
});
