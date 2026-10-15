// Post-build guard: what actually shipped must match the security and brand promises.
import { readFileSync, readdirSync } from 'node:fs';

const fail = [];
const html = readFileSync('dist/index.html', 'utf8');
const brand = JSON.parse(readFileSync('brand.json', 'utf8'));

if (!/<meta http-equiv="Content-Security-Policy"/.test(html))
  fail.push('index.html has no CSP meta');
if (/unsafe-eval|script-src[^;]*unsafe-inline/.test(html)) fail.push('CSP allows unsafe script');
for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
  if (!/\bsrc=/.test(m[1])) fail.push('inline <script> in index.html');
}
if (/<style\b/i.test(html)) fail.push('inline <style> element in index.html');
if (/(?:src|href)="https?:\/\//.test(html)) fail.push('external resource referenced in index.html');
if (html.includes('%BRAND_ACCENT%')) fail.push('brand placeholder not replaced');
if (!html.includes(`content="${brand.accent}"`)) fail.push('theme-color is not the brand accent');

const css = readdirSync('dist/assets')
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(`dist/assets/${f}`, 'utf8'))
  .join('\n');
if (!new RegExp(`--brand:\\s*${brand.accent}`, 'i').test(css)) {
  fail.push('built CSS does not contain the brand accent token');
}
if (!css.includes('data-theme')) fail.push('built CSS has no data-theme rules');
if (/https?:\/\//.test(css.replace(/http:\/\/www\.w3\.org\/\d+\/svg/g, ''))) {
  fail.push('built CSS references an external URL');
}

if (fail.length > 0) {
  console.error(`dist check failed:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'dist check ok: CSP present, no inline script/style, no external URLs, brand token shipped',
);
