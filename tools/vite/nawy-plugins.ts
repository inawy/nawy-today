import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { themeCss } from '../../src/ui/theme/tokens';
import type { Brand } from '../../src/ui/theme/tokens';
import { pwaPlugin } from './pwa';

// Build-time plumbing that keeps ONE source of truth for the brand (D-011) and ships a strict
// Content-Security-Policy (D-010).

export interface BrandFile extends Brand {
  readonly name: string;
  readonly nameAr: string;
}

export function readBrand(path: string): BrandFile {
  const brand = JSON.parse(readFileSync(path, 'utf8')) as BrandFile;
  if (!/^#[0-9A-Fa-f]{6}$/.test(brand.accent))
    throw new Error('brand.json: accent must be #RRGGBB');
  return brand;
}

/**
 * No inline script, no external origin, no eval. Inline style ATTRIBUTES stay allowed (the month
 * grid positions bars with CSS variables); inline <style> elements and external CSS do not.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function nawyPlugins(brandPath: string): Plugin[] {
  const brand = readBrand(brandPath);
  const VIRTUAL = 'virtual:theme.css';
  return [
    {
      name: 'nawy-theme',
      resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
      load: (id) => (id === `\0${VIRTUAL}` ? themeCss(brand) : undefined),
    },
    {
      name: 'nawy-html',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          let out = html.replaceAll('%BRAND_ACCENT%', brand.accent);
          // Dev server needs inline HMR scripts, so the policy is applied to builds only.
          if (ctx.bundle) {
            out = out.replace(
              '<head>',
              `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
            );
            out = out.replace(
              '</head>',
              '  <link rel="manifest" href="./manifest.webmanifest" />\n  </head>',
            );
          }
          return out;
        },
      },
    },
    pwaPlugin(brand, fileURLToPath(new URL('./sw.template.js', import.meta.url))),
  ];
}
