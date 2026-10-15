// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandRule, parseRule } from '@/core/recurrence';
import type { Rule } from '@/core/recurrence';

const rule = (text: string): Rule => {
  const r = parseRule(text);
  if (!r.ok) throw new Error(r.error);
  return r.rule;
};
const expand = (text: string, start: string, from: string, to: string, limit = 1000) =>
  expandRule(rule(text), start, from, to, { limit });

interface Fixture {
  id: string;
  category: 'normal' | 'contested' | 'never-matching';
  rule: string;
  dtstart: string;
  window: { from: string; to: string };
  expected: string[];
}
const fixtures = (
  JSON.parse(readFileSync('tests/fixtures/recurrence-golden.json', 'utf8')) as { cases: Fixture[] }
).cases;

describe('golden fixtures (python-dateutil is the independent reference, D-021)', () => {
  for (const category of ['normal', 'contested', 'never-matching'] as const) {
    const group = fixtures.filter((c) => c.category === category);
    it(`${category}: all ${group.length} cases match`, () => {
      expect(group.length).toBeGreaterThan(0);
      const failures = group
        .filter((c) => {
          const got = expandRule(rule(c.rule), c.dtstart, c.window.from, c.window.to, {
            limit: 400,
          });
          return JSON.stringify(got) !== JSON.stringify(c.expected);
        })
        .map((c) => `${c.id} ${c.dtstart} ${c.rule}`);
      expect(failures).toEqual([]);
    });
  }
});

describe('calendar edge cases', () => {
  it('skips months without a 31st instead of moving the date', () => {
    expect(expand('FREQ=MONTHLY', '2026-01-31', '2026-01-01', '2026-08-01')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
    ]);
  });

  it('yearly from 29 February happens only in leap years', () => {
    expect(expand('FREQ=YEARLY', '2024-02-29', '2024-01-01', '2037-01-01')).toEqual([
      '2024-02-29',
      '2028-02-29',
      '2032-02-29',
      '2036-02-29',
    ]);
  });

  it('last day of month via BYMONTHDAY=-1 including February', () => {
    expect(expand('FREQ=MONTHLY;BYMONTHDAY=-1', '2028-01-31', '2028-01-01', '2028-04-01')).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
  });

  it('first Monday and last Friday of the month', () => {
    expect(expand('FREQ=MONTHLY;BYDAY=1MO', '2026-10-05', '2026-10-01', '2027-01-01')).toEqual([
      '2026-10-05',
      '2026-11-02',
      '2026-12-07',
    ]);
    expect(expand('FREQ=MONTHLY;BYDAY=-1FR', '2026-10-30', '2026-10-01', '2027-01-01')).toEqual([
      '2026-10-30',
      '2026-11-27',
      '2026-12-25',
    ]);
  });

  it('a fifth weekday that does not exist in a month is skipped', () => {
    expect(expand('FREQ=MONTHLY;BYDAY=5SU', '2026-11-29', '2026-11-01', '2027-04-01')).toEqual([
      '2026-11-29',
      '2027-01-31',
      '2027-03-28',
    ]);
  });

  it('fortnightly weeks depend on WKST (RFC 5545 example)', () => {
    const run = (wkst: string) =>
      expand(
        `FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=${wkst};COUNT=4`,
        '1997-08-05',
        '1997-08-01',
        '1997-12-01',
      );
    // DTSTART is Tuesday 5 Aug 1997.
    expect(run('MO')).toEqual(['1997-08-10', '1997-08-18', '1997-08-24', '1997-09-01']);
    expect(run('SU')).toEqual(['1997-08-17', '1997-08-18', '1997-08-31', '1997-09-01']);
  });

  it('keeps the time of day of DTSTART', () => {
    expect(expand('FREQ=DAILY;COUNT=2', '2026-10-13T09:30', '2026-10-01', '2026-11-01')).toEqual([
      '2026-10-13T09:30',
      '2026-10-14T09:30',
    ]);
  });

  it('UNTIL is inclusive, for dates and for floating date-times', () => {
    expect(expand('FREQ=DAILY;UNTIL=20261015', '2026-10-13', '2026-10-01', '2026-11-01')).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ]);
    expect(
      expand('FREQ=DAILY;UNTIL=20261014T093000', '2026-10-13T09:30', '2026-10-01', '2026-11-01'),
    ).toEqual(['2026-10-13T09:30', '2026-10-14T09:30']);
    expect(
      expand('FREQ=DAILY;UNTIL=20261014T093000', '2026-10-13T09:31', '2026-10-01', '2026-11-01'),
    ).toEqual(['2026-10-13T09:31']);
  });

  it('window bounds: from inclusive, to exclusive', () => {
    expect(expand('FREQ=DAILY', '2026-10-01', '2026-10-05', '2026-10-07')).toEqual([
      '2026-10-05',
      '2026-10-06',
    ]);
  });

  it('COUNT counts occurrences before the window too', () => {
    expect(expand('FREQ=DAILY;COUNT=5', '2026-10-01', '2026-10-04', '2026-11-01')).toEqual([
      '2026-10-04',
      '2026-10-05',
    ]);
  });

  it('returns nothing for a window before DTSTART', () => {
    expect(expand('FREQ=DAILY', '2026-10-01', '2020-01-01', '2026-10-01')).toEqual([]);
  });

  it('honours the limit with the earliest occurrences', () => {
    expect(expand('FREQ=DAILY', '2026-10-01', '2026-10-01', '2030-01-01', 3)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('rejects a malformed DTSTART or window', () => {
    expect(() => expandRule(rule('FREQ=DAILY'), '2026-02-30', '2026-01-01', '2026-02-01')).toThrow(
      RangeError,
    );
    expect(() =>
      expandRule(rule('FREQ=DAILY'), '2026-02-01T9:00', '2026-01-01', '2026-02-01'),
    ).toThrow(RangeError);
    expect(() => expandRule(rule('FREQ=DAILY'), '2026-02-01', 'nope', '2026-02-01')).toThrow(
      RangeError,
    );
  });
});

describe('termination and cost', () => {
  it('terminates for rules that can never match, even over huge windows', () => {
    for (const text of [
      'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30',
      'FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31',
      'FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30',
      'FREQ=DAILY;COUNT=5;BYMONTHDAY=31;BYMONTH=2',
    ]) {
      expect(expand(text, '2026-01-01', '2026-01-01', '9999-12-31')).toEqual([]);
    }
  });

  it('jumps straight to a far window instead of walking from DTSTART', () => {
    const t0 = performance.now();
    for (let i = 0; i < 2000; i += 1) {
      expandRule(rule('FREQ=DAILY'), '1900-01-01', '2900-06-01', '2900-07-01');
    }
    // Walking 365k days 2000 times would take many seconds; jumping is microseconds.
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('expands 1000 series over a year within budget', () => {
    const rules = [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=MO,WE',
      'FREQ=MONTHLY;BYDAY=2TU',
      'FREQ=YEARLY',
    ].map(rule);
    const t0 = performance.now();
    let total = 0;
    for (let i = 0; i < 1000; i += 1) {
      const r = rules[i % rules.length] as Rule;
      total += expandRule(r, '2020-03-01', '2026-01-01', '2027-01-01').length;
    }
    expect(total).toBeGreaterThan(1000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

// Seeded generator: the same sequence every run, so a failure is reproducible.
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('invariants over random rules (seeded)', () => {
  const rnd = prng(20261013);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

  function randomRule(): string {
    const freq = pick(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
    const parts = [`FREQ=${freq}`, `INTERVAL=${1 + Math.floor(rnd() * 4)}`];
    if (freq === 'WEEKLY' || rnd() < 0.3) parts.push(`BYDAY=${pick(days)},${pick(days)}`);
    if (freq === 'MONTHLY' && rnd() < 0.5)
      parts.push(`BYMONTHDAY=${pick([1, 15, 29, 30, 31, -1, -3])}`);
    if (freq === 'YEARLY') parts.push(`BYMONTH=${1 + Math.floor(rnd() * 12)}`);
    if (rnd() < 0.3) parts.push(`COUNT=${1 + Math.floor(rnd() * 30)}`);
    return parts.join(';');
  }

  it('output is ascending, unique, inside the window and never before DTSTART', () => {
    for (let i = 0; i < 400; i += 1) {
      const text = randomRule();
      const parsed = parseRule(text);
      if (!parsed.ok) continue; // e.g. BYDAY listed twice is fine, anything unsupported is skipped
      const start = `20${20 + Math.floor(rnd() * 10)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 10)}`;
      const from = `20${25 + Math.floor(rnd() * 8)}-01-01`;
      const to = `20${33 + Math.floor(rnd() * 5)}-01-01`;
      const got = expandRule(parsed.rule, start, from, to, { limit: 5000 });
      expect([...got].sort()).toEqual(got);
      expect(new Set(got).size).toBe(got.length);
      for (const o of got) {
        expect(o >= from && o < to && o >= start).toBe(true);
      }
    }
  });

  it('a window result equals the same slice of a full walk from DTSTART (jump is exact)', () => {
    for (let i = 0; i < 300; i += 1) {
      const text = randomRule();
      const parsed = parseRule(text);
      if (!parsed.ok || parsed.rule.count !== undefined) continue;
      const start = `2019-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 10)}`;
      const from = `202${2 + Math.floor(rnd() * 6)}-0${1 + Math.floor(rnd() * 9)}-0${1 + Math.floor(rnd() * 9)}`;
      const to = `203${Math.floor(rnd() * 3)}-06-15`;
      const full = expandRule(parsed.rule, start, start, to, { limit: 100000 });
      const windowed = expandRule(parsed.rule, start, from, to, { limit: 100000 });
      expect(windowed).toEqual(full.filter((o) => o >= from));
    }
  });
});
