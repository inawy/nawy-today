// Reports what ships (gzip), and what temporal-polyfill alone costs (D-006 asked for this
// measurement). The second number comes from a throw-away build where the polyfill is replaced
// by an empty stub: that build is for measuring only and is never shipped.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { build } from 'vite';

const sizes = (dir) => {
  const out = { js: 0, css: 0, jsRaw: 0 };
  for (const f of readdirSync(path.join(dir, 'assets'))) {
    const data = readFileSync(path.join(dir, 'assets', f));
    if (f.endsWith('.js')) {
      out.js += gzipSync(data).length;
      out.jsRaw += data.length;
    } else if (f.endsWith('.css')) out.css += gzipSync(data).length;
  }
  return out;
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const shipped = sizes('dist');

mkdirSync('dist-measure-src', { recursive: true });
const stub = path.resolve('dist-measure-src/temporal-stub.js');
writeFileSync(stub, 'export const Temporal = {};\n');
await build({
  logLevel: 'error',
  resolve: { alias: { 'temporal-polyfill': stub } },
  build: { outDir: 'dist-measure', emptyOutDir: true },
});
const without = sizes('dist-measure');
rmSync('dist-measure-src', { recursive: true, force: true });
rmSync('dist-measure', { recursive: true, force: true });

const temporal = shipped.js - without.js;
const msg = [
  `shipped JS (gzip): ${kb(shipped.js)} (${kb(shipped.jsRaw)} raw)`,
  `shipped CSS (gzip): ${kb(shipped.css)}`,
  `temporal-polyfill share of JS (gzip): ${kb(temporal)} (${((temporal / shipped.js) * 100).toFixed(0)}%)`,
].join('; ');
console.log(msg);
console.log(`::notice title=bundle size::${msg}`);
