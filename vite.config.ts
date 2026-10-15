import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { nawyPlugins } from './tools/vite/nawy-plugins';

// base './' lets the build run under a sub-path (GitHub Pages) — see D-009.
export default defineConfig({
  base: './',
  plugins: [react(), ...nawyPlugins(fileURLToPath(new URL('./brand.json', import.meta.url)))],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
