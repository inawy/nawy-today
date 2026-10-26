import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { nawyPlugins } from './tools/vite/nawy-plugins';

// What this build is, shown in "About" so a bug report can name it (D-052). Read here, in the
// tooling, so `src` never touches the clock or the environment.
const sha = (process.env['GITHUB_SHA'] ?? '').slice(0, 7);
const build = {
  sha: /^[0-9a-f]{7}$/.test(sha) ? sha : 'dev',
  date: new Date().toISOString().slice(0, 10),
};

// base './' lets the build run under a sub-path (GitHub Pages) — see D-009.
export default defineConfig({
  base: './',
  define: {
    __APP_BUILD_SHA__: JSON.stringify(build.sha),
    __APP_BUILD_DATE__: JSON.stringify(build.date),
  },
  plugins: [react(), ...nawyPlugins(fileURLToPath(new URL('./brand.json', import.meta.url)))],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
