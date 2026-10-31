// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP, nawyPlugins, readBrand } from '../../tools/vite/nawy-plugins';

const brandPath = path.resolve('brand.json');

describe('readBrand', () => {
  it('reads the real brand file', () => {
    expect(readBrand(brandPath).accent).toBe('#3D7BFF');
  });

  it('rejects an invalid accent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-'));
    const bad = path.join(dir, 'brand.json');
    writeFileSync(bad, JSON.stringify({ name: 'x', nameAr: 'x', accent: 'blue' }));
    expect(() => readBrand(bad)).toThrow(/accent/);
  });
});

describe('CSP', () => {
  it('is closed by default and never allows eval or inline script', () => {
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toMatch(/unsafe-eval/);
    expect(CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(CSP).not.toMatch(/https?:/);
  });
});

describe('plugins', () => {
  const [theme, html] = nawyPlugins(brandPath) as unknown as [
    { resolveId: (id: string) => string | undefined; load: (id: string) => string | undefined },
    { transformIndexHtml: { handler: (h: string, c: { bundle?: object }) => string } },
  ];

  it('serves the theme stylesheet as a virtual module', () => {
    const id = theme.resolveId('virtual:theme.css');
    expect(id).toBeDefined();
    expect(theme.load(id as string)).toContain('--nawy-color-brand: #3D7BFF;');
    expect(theme.resolveId('other.css')).toBeUndefined();
  });

  const page =
    '<html><head><meta name="theme-color" content="%THEME_LIGHT%" /><meta name="theme-color" content="%THEME_DARK%" /></head></html>';

  it('injects the brand into the page, and the CSP in builds only', () => {
    const dev = html.transformIndexHtml.handler(page, {});
    expect(dev).toContain('content="#FFFFFF"');
    expect(dev).toContain('content="#151A22"');
    expect(dev).not.toContain('Content-Security-Policy');
    const build = html.transformIndexHtml.handler(page, { bundle: {} });
    expect(build).toContain('http-equiv="Content-Security-Policy"');
  });
});
