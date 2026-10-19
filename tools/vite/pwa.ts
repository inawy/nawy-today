import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import type { BrandFile } from './nawy-plugins';

// Web app manifest + service worker, generated at build from brand.json and the files that
// actually shipped (D-027).

export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: string;
}

export function buildManifest(brand: BrandFile): Record<string, unknown> {
  const icons: ManifestIcon[] = [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  return {
    id: './',
    name: brand.name,
    short_name: brand.name,
    description: 'يومك بطريقتك.',
    lang: 'ar',
    dir: 'rtl',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.accent,
    icons,
  };
}

/** Every file under `dir` (posix-style relative paths), sorted, except the worker itself. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.filter((f) => f !== 'sw.js').sort();
}

/** Changes whenever any shipped file changes, so a new build always yields a new worker. */
export function versionOf(files: readonly { path: string; content: Buffer | string }[]): string {
  const hash = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    hash.update(f.path).update('\0').update(f.content).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function buildServiceWorker(template: string, version: string, precache: readonly string[]) {
  if (!/^[0-9a-f]{12}$/.test(version)) throw new Error('bad version');
  return template
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(precache.map((p) => `./${p}`)));
}

export function pwaPlugin(brand: BrandFile, templatePath: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'nawy-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: `${JSON.stringify(buildManifest(brand), null, 2)}\n`,
      });
    },
    // After Vite has copied public/: only then is the list of shipped files complete.
    closeBundle() {
      const files = listFiles(outDir);
      const version = versionOf(
        files.map((path) => ({ path, content: readFileSync(join(outDir, path)) })),
      );
      const source = buildServiceWorker(readFileSync(templatePath, 'utf8'), version, files);
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}
