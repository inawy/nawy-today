// Post-build guard: what actually shipped must match the security and brand promises.
import { existsSync, readFileSync, readdirSync } from 'node:fs';

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
if (/%[A-Z_]+%/.test(html)) fail.push('a placeholder was not replaced');
if (!/name="theme-color"\s+content="#FFFFFF"/.test(html)) fail.push('light theme-color is not the top bar colour');
if (!/name="theme-color"\s+content="#151A22"/.test(html)) fail.push('dark theme-color is not the top bar colour');

const css = readdirSync('dist/assets')
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(`dist/assets/${f}`, 'utf8'))
  .join('\n');
if (!new RegExp(`--nawy-color-brand:\\s*${brand.accent}`, 'i').test(css)) {
  fail.push('built CSS does not contain the brand accent token');
}
if (!css.includes('data-theme')) fail.push('built CSS has no data-theme rules');
if (/https?:\/\//.test(css.replace(/http:\/\/www\.w3\.org\/\d+\/svg/g, ''))) {
  fail.push('built CSS references an external URL');
}

// Every URL in the page must be relative: the app is served from a sub-path (GitHub Pages), where
// "/icons/x.png" would point outside it (installed apps then fall back to a generic icon).
for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
  fail.push(`index.html has an absolute URL: ${m[1]}`);
}

// PWA: manifest, icons and the service worker must exist, agree with each other and stay local.
if (!/<link rel="manifest" href="\.\/manifest\.webmanifest"/.test(html)) {
  fail.push('index.html does not link the manifest');
}
const FONT_FILES = [
  'plex-arabic-Regular.woff2',
  'plex-arabic-Bold.woff2',
  'OFL-IBM-Plex-Sans-Arabic.txt',
];
for (const f of FONT_FILES) {
  if (!existsSync(`dist/fonts/${f}`)) fail.push(`font file missing from dist: ${f}`);
}
if (!existsSync('dist/manifest.webmanifest')) {
  fail.push('dist/manifest.webmanifest is missing');
} else {
  const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
  if (manifest.theme_color !== '#FFFFFF') fail.push('manifest theme_color is not the top bar colour');
  if (manifest.start_url !== './' || manifest.scope !== './') fail.push('manifest is not relative');
  if (!manifest.icons?.some((i) => i.purpose === 'maskable')) fail.push('manifest has no maskable icon');
  for (const icon of manifest.icons ?? []) {
    if (!existsSync(`dist/${icon.src}`)) fail.push(`manifest icon missing from dist: ${icon.src}`);
  }
}
if (!existsSync('dist/sw.js')) {
  fail.push('dist/sw.js is missing');
} else {
  const sw = readFileSync('dist/sw.js', 'utf8');
  if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) fail.push('sw.js placeholders not replaced');
  if (!sw.includes('"./index.html"')) fail.push('sw.js does not precache index.html');
  if (/https?:\/\//.test(sw)) fail.push('sw.js references an external URL');
  if (/skipWaiting\(\)/.test(sw.split("addEventListener('message'")[0] ?? '')) {
    fail.push('sw.js calls skipWaiting outside the message handler');
  }
}

if (fail.length > 0) {
  console.error(`dist check failed:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'dist check ok: CSP present, no inline script/style, no external URLs, brand token, manifest and worker shipped',
);
