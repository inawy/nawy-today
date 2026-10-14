// Orchestrates the recurrence-library comparison (D-021) and prints a text report.
// Never-matching rules run one-per-process with a hard timeout, because a library that loops
// forever cannot be interrupted from inside.
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fixtures = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/recurrence-golden.json', import.meta.url), 'utf8'),
);
const here = new URL('./lib-run.mjs', import.meta.url).pathname;
const libs = [
  { key: 'rrule', pkg: 'rrule', ver: '2.8.1' },
  { key: 'ical', pkg: 'ical.js', ver: '2.2.1' },
];

function child(args, timeoutMs) {
  const r = spawnSync('node', [here, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') return { timeout: true };
  if (r.status !== 0) return { crash: (r.stderr || '').slice(-400) };
  return { results: JSON.parse(r.stdout) };
}

const lines = [];
const out = (s = '') => lines.push(s);

for (const lib of libs) {
  out(`=== ${lib.pkg}@${lib.ver} ===`);
  try {
    const meta = JSON.parse(execSync(`npm view ${lib.pkg} --json license time.modified dist-tags`, { encoding: 'utf8' }));
    const t = JSON.parse(execSync(`npm view ${lib.pkg} time --json`, { encoding: 'utf8' }));
    out(`license: ${meta.license}; latest: ${meta['dist-tags']?.latest}; published ${lib.ver}: ${t[lib.ver]}; last modified: ${meta['time.modified']}`);
  } catch (e) {
    out(`(npm metadata unavailable: ${String(e.message).slice(0, 120)})`);
  }

  const main = child([lib.key, 'normal+contested'], 600_000);
  if (!main.results) {
    out(`MAIN RUN FAILED: ${JSON.stringify(main)}`);
  } else {
    for (const cat of ['normal', 'contested']) {
      const rs = main.results.filter((r) => r.category === cat);
      const ok = rs.filter((r) => r.pass).length;
      out(`${cat}: ${ok}/${rs.length} match${cat === 'contested' ? ' (informational, not counted)' : ''}`);
      const bad = rs.filter((r) => !r.pass);
      const byRule = new Map();
      for (const b of bad) byRule.set(b.rule.replace(/UNTIL=\d+(T\d+)?/, 'UNTIL=*'), (byRule.get(b.rule.replace(/UNTIL=\d+(T\d+)?/, 'UNTIL=*')) ?? 0) + 1);
      if (cat === 'normal') {
        for (const [rule, n] of [...byRule].slice(0, 12)) out(`  FAIL x${n}: ${rule}`);
        for (const b of bad.slice(0, 4)) out(`  e.g. ${b.id} ${b.dtstart} ${b.rule} ${b.error ?? `got/exp=${b.counts} missing=${b.missing} extra=${b.extra}`}`);
      }
    }
    const worst = [...main.results].sort((a, b) => b.ms - a.ms)[0];
    out(`slowest case: ${worst.ms.toFixed(0)} ms (${worst.dtstart} ${worst.rule})`);
    const total = main.results.reduce((s, r) => s + r.ms, 0);
    out(`total time over ${main.results.length} cases: ${total.toFixed(0)} ms`);
  }

  let terminated = 0;
  let correct = 0;
  const hangs = [];
  const never = fixtures.cases.filter((c) => c.category === 'never-matching');
  for (const c of never) {
    const r = child([lib.key, 'never-matching', c.id], 20_000);
    if (r.results) {
      terminated += 1;
      if (r.results[0]?.pass) correct += 1;
    } else hangs.push(`${c.dtstart} ${c.rule} -> ${r.timeout ? 'TIMEOUT 20s' : `crash ${r.crash}`}`);
  }
  out(`never-matching: terminated ${terminated}/${never.length}, empty-correct ${correct}/${never.length}`);
  for (const h of hangs.slice(0, 5)) out(`  ${h}`);
  out();
}
out('Window jumping: neither library skips ahead; both iterate from DTSTART (checked in source/docs, see D-021 result).');
console.log(lines.join('\n'));
