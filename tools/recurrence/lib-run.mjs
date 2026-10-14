// Runs ONE library over the golden fixtures and prints a JSON result on stdout.
//   node lib-run.mjs <rrule|ical> <normal+contested|never-matching> [caseId]
// Libraries are resolved from SPIKE_LIBS_DIR (a throw-away dir; they never enter package.json).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [lib, group, onlyId] = process.argv.slice(2);
const libsDir = process.env.SPIKE_LIBS_DIR;
const fixtures = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/recurrence-golden.json', import.meta.url), 'utf8'),
);
const require = createRequire(path.join(libsDir, 'x.js'));
const MAX = 400;

const isAllDay = (s) => !s.includes('T');
const cut = (iso, allDay) => (allDay ? iso.slice(0, 10) : iso.slice(0, 16));
const pad = (n) => String(n).padStart(2, '0');

function makeRrule() {
  const { rrulestr } = require('rrule');
  return (c) => {
    const allDay = isAllDay(c.dtstart);
    const d = c.dtstart.replace(/[-:]/g, '');
    const dt = allDay ? `${d}T000000Z` : `${d}00Z`;
    const rule = rrulestr(`DTSTART:${dt}\nRRULE:${c.rule}`);
    const toDate = (s) => new Date(allDay ? `${s}T00:00:00Z` : `${s}:00Z`);
    const lo = toDate(c.window.from);
    const hi = toDate(c.window.to);
    const out = [];
    for (const o of rule.between(lo, hi, true)) {
      if (o >= hi) continue;
      out.push(cut(o.toISOString(), allDay));
      if (out.length >= MAX) break;
    }
    return out;
  };
}

async function makeIcal() {
  const mod = await import(pathToFileURL(require.resolve('ical.js')).href);
  const ICAL = mod.default ?? mod;
  return (c) => {
    const allDay = isAllDay(c.dtstart);
    const start = allDay
      ? ICAL.Time.fromDateString(c.dtstart)
      : ICAL.Time.fromDateTimeString(`${c.dtstart}:00`);
    const recur = ICAL.Recur.fromString(c.rule);
    const iter = recur.iterator(start);
    const out = [];
    const lo = c.window.from;
    const hi = c.window.to;
    let guard = 0;
    for (let t = iter.next(); t; t = iter.next()) {
      if (++guard > 3_000_000) throw new Error('iteration cap (3M) reached');
      const s = cut(t.toString(), allDay);
      if (s >= hi) break;
      if (s >= lo) out.push(s);
      if (out.length >= MAX) break;
    }
    return out;
  };
}

const run = lib === 'rrule' ? makeRrule() : await makeIcal();
const want = (c) =>
  onlyId
    ? c.id === onlyId
    : group === 'never-matching'
      ? c.category === 'never-matching'
      : c.category !== 'never-matching';

const results = [];
for (const c of fixtures.cases.filter(want)) {
  const t0 = performance.now();
  let got;
  let error;
  try {
    got = run(c);
  } catch (e) {
    error = String(e?.message ?? e);
  }
  const ms = performance.now() - t0;
  const pass = !error && JSON.stringify(got) === JSON.stringify(c.expected);
  const r = { id: c.id, category: c.category, rule: c.rule, dtstart: c.dtstart, pass, ms };
  if (error) r.error = error;
  else if (!pass) {
    const g = new Set(got);
    const e = new Set(c.expected);
    r.missing = c.expected.filter((x) => !g.has(x)).slice(0, 3);
    r.extra = got.filter((x) => !e.has(x)).slice(0, 3);
    r.counts = [got.length, c.expected.length];
  }
  results.push(r);
}
process.stdout.write(JSON.stringify(results));
