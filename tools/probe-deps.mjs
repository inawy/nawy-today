// Dev-only: prints current version / last publish / deprecation for candidate deps
// as GitHub annotations, so results are readable via the check-runs API.
import { execFileSync } from 'node:child_process';

const pkgs = [
  'vite', 'react', 'react-dom', 'typescript', 'vitest', 'jsdom', 'dexie',
  'vite-plugin-pwa', '@vitejs/plugin-react', 'eslint', 'typescript-eslint',
  'eslint-plugin-react-hooks', 'prettier', 'fake-indexeddb', '@playwright/test',
  '@testing-library/react', 'tailwindcss', '@tailwindcss/vite',
  'temporal-polyfill', '@js-temporal/polyfill', 'date-fns', '@date-fns/tz',
  'rrule', 'ical.js', 'fast-check', '@fontsource/ibm-plex-sans-arabic',
];

for (const name of pkgs) {
  try {
    const out = execFileSync('npm', ['view', name, '--json',
      'version', 'time.modified', 'deprecated', 'dist.unpackedSize', 'license'],
      { encoding: 'utf8' });
    const j = JSON.parse(out);
    const msg = `${name}@${j.version} modified=${String(j['time.modified']).slice(0, 10)} ` +
      `size=${j['dist.unpackedSize']} license=${j.license} deprecated=${j.deprecated ?? 'no'}`;
    console.log(`::notice title=dep::${msg}`);
  } catch (e) {
    console.log(`::warning title=dep-fail::${name} ${String(e.message).split('\n')[0]}`);
  }
}
