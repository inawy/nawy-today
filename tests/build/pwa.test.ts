// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { readBrand } from '../../tools/vite/nawy-plugins';
import { buildManifest, buildServiceWorker, listFiles, versionOf } from '../../tools/vite/pwa';

const brand = readBrand(path.resolve('brand.json'));
const template = readFileSync(path.resolve('tools/vite/sw.template.js'), 'utf8');

describe('manifest', () => {
  const m = buildManifest(brand) as Record<string, unknown> & {
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('is a standalone, Arabic, right-to-left app scoped to its own folder', () => {
    expect(m).toMatchObject({
      start_url: './',
      scope: './',
      display: 'standalone',
      lang: 'ar',
      dir: 'rtl',
      theme_color: brand.accent,
    });
  });

  it('has the icons installability needs, including a maskable one, with relative paths', () => {
    const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(
      expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
    );
    for (const icon of m.icons) {
      expect(icon.src.startsWith('/')).toBe(false);
      expect(() => readFileSync(path.resolve('public', icon.src))).not.toThrow();
    }
  });
});

describe('versionOf / listFiles', () => {
  it('changes with any file content or name, and not with order', () => {
    const a = versionOf([
      { path: 'a.js', content: '1' },
      { path: 'b.css', content: '2' },
    ]);
    expect(
      versionOf([
        { path: 'b.css', content: '2' },
        { path: 'a.js', content: '1' },
      ]),
    ).toBe(a);
    expect(
      versionOf([
        { path: 'a.js', content: '1x' },
        { path: 'b.css', content: '2' },
      ]),
    ).not.toBe(a);
    expect(
      versionOf([
        { path: 'a2.js', content: '1' },
        { path: 'b.css', content: '2' },
      ]),
    ).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it('lists nested files with posix paths and leaves the worker out', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dist-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), '');
    writeFileSync(path.join(dir, 'sw.js'), '');
    writeFileSync(path.join(dir, 'assets', 'app.js'), '');
    expect(listFiles(dir)).toEqual(['assets/app.js', 'index.html']);
  });
});

// --- The worker itself, run against a minimal fake of the service worker environment. ----------

type Handler = (event: Record<string, unknown>) => void;

function boot(version = 'abcdef012345', precache = ['index.html', 'assets/app.js']) {
  const source = buildServiceWorker(template, version, precache);
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, string>>();
  const log = { skipWaiting: vi.fn(), claim: vi.fn(), fetched: [] as string[] };

  const key = (r: unknown): string =>
    new URL(typeof r === 'string' ? r : (r as { url: string }).url, 'https://app.test/today/sw.js')
      .href;

  class FakeRequest {
    url: string;
    method: string;
    mode: string;
    constructor(
      input: string | FakeRequest,
      init: { cache?: string; method?: string; mode?: string } = {},
    ) {
      this.url = key(input);
      this.method = init.method ?? 'GET';
      this.mode = init.mode ?? 'cors';
    }
  }

  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name) as Map<string, string>;
      return {
        addAll: async (requests: FakeRequest[]) => {
          for (const r of requests) store.set(r.url, `cached:${r.url}`);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: unknown, options: { cacheName: string }) => {
      const hit = stores.get(options.cacheName)?.get(key(request));
      return hit === undefined ? undefined : { body: hit };
    },
  };

  const sandbox = {
    self: {
      location: { origin: 'https://app.test' },
      addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
      skipWaiting: log.skipWaiting,
      clients: { claim: async () => log.claim() },
    },
    caches,
    Request: FakeRequest,
    URL,
    fetch: async (r: FakeRequest) => {
      log.fetched.push(r.url);
      return { body: `network:${r.url}` };
    },
  };
  vm.runInNewContext(source, sandbox);

  const waitable = async (type: string, event: Record<string, unknown> = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]?.({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  const respond = async (request: Partial<FakeRequest>) => {
    let result: Promise<unknown> | undefined;
    handlers.fetch?.({
      request: new FakeRequest(request.url ?? 'https://app.test/today/', request),
      respondWith: (p: Promise<unknown>) => (result = p),
    });
    return result === undefined ? 'ignored' : await result;
  };
  return { handlers, stores, log, waitable, respond };
}

describe('service worker', () => {
  it('precaches every shipped file under a versioned, prefixed cache on install', async () => {
    const w = boot();
    await w.waitable('install');
    expect([...w.stores.keys()]).toEqual(['nawy-today:vabcdef012345']);
    expect([...(w.stores.get('nawy-today:vabcdef012345')?.keys() ?? [])]).toEqual([
      'https://app.test/today/index.html',
      'https://app.test/today/assets/app.js',
    ]);
  });

  it('never takes over by itself: an update waits for the user (no skipWaiting on install)', async () => {
    const w = boot();
    await w.waitable('install');
    expect(w.log.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message?.({ data: { type: 'something-else' } });
    w.handlers.message?.({ data: undefined });
    expect(w.log.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message?.({ data: { type: 'SKIP_WAITING' } });
    expect(w.log.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('on activate deletes only OLD caches with its own prefix, then claims clients', async () => {
    const w = boot();
    w.stores.set('nawy-today:vold', new Map());
    w.stores.set('nawy-notes:v1', new Map()); // the sibling app on the same domain (D-009)
    w.stores.set('unrelated', new Map());
    await w.waitable('install');
    await w.waitable('activate');
    expect([...w.stores.keys()].sort()).toEqual([
      'nawy-notes:v1',
      'nawy-today:vabcdef012345',
      'unrelated',
    ]);
    expect(w.log.claim).toHaveBeenCalledTimes(1);
  });

  it('answers page loads and assets from the cache without touching the network', async () => {
    const w = boot();
    await w.waitable('install');
    expect(await w.respond({ url: 'https://app.test/today/', mode: 'navigate' })).toEqual({
      body: 'cached:https://app.test/today/index.html',
    });
    expect(await w.respond({ url: 'https://app.test/today/?view=week', mode: 'navigate' })).toEqual(
      {
        body: 'cached:https://app.test/today/index.html',
      },
    );
    expect(await w.respond({ url: 'https://app.test/today/assets/app.js' })).toEqual({
      body: 'cached:https://app.test/today/assets/app.js',
    });
    expect(w.log.fetched).toEqual([]);
  });

  it('falls back to the network only for what is not cached', async () => {
    const w = boot();
    await w.waitable('install');
    expect(await w.respond({ url: 'https://app.test/today/other.txt' })).toEqual({
      body: 'network:https://app.test/today/other.txt',
    });
  });

  it('ignores writes and other origins entirely', async () => {
    const w = boot();
    await w.waitable('install');
    expect(await w.respond({ url: 'https://app.test/today/x', method: 'POST' })).toBe('ignored');
    expect(await w.respond({ url: 'https://evil.test/today/assets/app.js' })).toBe('ignored');
  });

  it('refuses a malformed version', () => {
    expect(() => buildServiceWorker(template, '../../x', [])).toThrow();
  });
});
