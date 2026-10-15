import { describe, expect, it } from 'vitest';
import { formatRule, parseRule } from '@/core/recurrence';

const parse = (t: string) => {
  const r = parseRule(t);
  if (!r.ok) throw new Error(r.error);
  return r.rule;
};
const error = (t: string) => {
  const r = parseRule(t);
  return r.ok ? undefined : r.error;
};

describe('parseRule', () => {
  it('parses a full rule', () => {
    expect(parse('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU;COUNT=5')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: [{ day: 1 }, { day: 3 }],
      byMonthDay: [],
      byMonth: [],
      count: 5,
      wkst: 7,
    });
  });

  it('accepts lower case and ordinals in monthly rules', () => {
    const r = parse('freq=monthly;byday=-1fr,2tu');
    expect(r.byDay).toEqual([
      { day: 2, nth: 2 },
      { day: 5, nth: -1 },
    ]);
  });

  it('reads UNTIL as a date or a floating date-time', () => {
    expect(parse('FREQ=DAILY;UNTIL=20261231').until).toBe('2026-12-31');
    expect(parse('FREQ=DAILY;UNTIL=20261231T213000').until).toBe('2026-12-31T21:30');
  });

  it.each([
    ['', 'empty'],
    ['INTERVAL=2', 'FREQ is required'],
    ['FREQ=HOURLY', 'unsupported FREQ'],
    ['FREQ=DAILY;BYSETPOS=1', 'unsupported part BYSETPOS'],
    ['FREQ=DAILY;BYHOUR=9', 'unsupported part BYHOUR'],
    ['FREQ=DAILY;FREQ=WEEKLY', 'duplicate'],
    ['FREQ=DAILY;INTERVAL=0', 'INTERVAL'],
    ['FREQ=DAILY;INTERVAL=1.5', 'INTERVAL'],
    ['FREQ=DAILY;COUNT=0', 'COUNT'],
    ['FREQ=DAILY;COUNT=3;UNTIL=20261231', 'cannot be combined'],
    ['FREQ=DAILY;UNTIL=20261231T000000Z', 'UNTIL'],
    ['FREQ=DAILY;UNTIL=20260230', 'UNTIL'],
    ['FREQ=WEEKLY;BYMONTHDAY=1', 'not allowed'],
    ['FREQ=WEEKLY;BYDAY=1MO', 'ordinals'],
    ['FREQ=YEARLY;BYDAY=20MO', 'ordinal'],
    ['FREQ=YEARLY;BYDAY=1MO', 'ordinals'],
    ['FREQ=MONTHLY;BYMONTHDAY=0', 'BYMONTHDAY'],
    ['FREQ=MONTHLY;BYMONTHDAY=32', 'BYMONTHDAY'],
    ['FREQ=YEARLY;BYMONTH=13', 'BYMONTH'],
    ['FREQ=MONTHLY;BYDAY=XX', 'BYDAY'],
    ['FREQ=WEEKLY;WKST=XX', 'WKST'],
    ['FREQ=DAILY;=3', 'malformed'],
  ])('rejects %s', (text, fragment) => {
    expect(error(text)).toContain(fragment === 'empty' ? 'empty' : fragment);
  });
});

describe('formatRule', () => {
  it.each([
    'FREQ=DAILY',
    'FREQ=DAILY;INTERVAL=3;COUNT=7',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU',
    'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231',
    'FREQ=MONTHLY;BYMONTHDAY=-2,-1,1',
    'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;UNTIL=20301231T090000',
  ])('round-trips %s', (text) => {
    const rule = parse(text);
    expect(formatRule(rule)).toBe(text);
    expect(parse(formatRule(rule))).toEqual(rule);
  });
});
