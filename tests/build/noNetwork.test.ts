import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The About dialog (D-051) promises that nothing leaves the device. This keeps the promise honest:
// if the app ever starts talking to a server, this fails until the text and a decision change too.
describe('the app does not talk to a server', () => {
  const calls = /\b(fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource)/;
  it('has no network API in src', () => {
    const offenders = sources('src').filter((file) => calls.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
