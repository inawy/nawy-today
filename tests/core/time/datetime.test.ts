// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  combine,
  datePart,
  fromInstantMs,
  isValidDateTime,
  isValidTimeZone,
  minuteOfDay,
  minutesBetween,
  nowLocal,
  timePart,
  todayIn,
  toInstantMs,
} from '@/core/time';

const RIYADH = 'Asia/Riyadh'; // UTC+03:00, no DST
const LONDON = 'Europe/London'; // 2026: DST starts Mar 29 01:00 UTC, ends Oct 25 01:00 UTC
const NEW_YORK = 'America/New_York'; // 2026: DST starts Mar 8, ends Nov 1

describe('isValidDateTime / isValidTimeZone', () => {
  it('accepts well-formed date-times', () => {
    expect(isValidDateTime('2026-10-13T09:00')).toBe(true);
    expect(isValidDateTime('2026-10-13T23:59')).toBe(true);
  });

  it.each([
    '2026-10-13', // date only
    '2026-10-13T09:00:00', // seconds are not part of the format
    '2026-10-13T24:00',
    '2026-10-13T09:60',
    '2026-02-30T09:00',
    '2026-10-13 09:00',
    '',
  ])('rejects %j', (v) => {
    expect(isValidDateTime(v)).toBe(false);
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Asia/Riyadh')).toBe(true);
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('parts', () => {
  it('splits and joins', () => {
    expect(datePart('2026-10-13T09:30')).toBe('2026-10-13');
    expect(timePart('2026-10-13T09:30')).toBe('09:30');
    expect(combine('2026-10-13', '09:30')).toBe('2026-10-13T09:30');
  });

  it('rejects a bad time when joining', () => {
    expect(() => combine('2026-10-13', '25:00')).toThrow(RangeError);
  });

  it('computes the minute of the day', () => {
    expect(minuteOfDay('2026-10-13T00:00')).toBe(0);
    expect(minuteOfDay('2026-10-13T09:30')).toBe(570);
    expect(minuteOfDay('2026-10-13T23:59')).toBe(1439);
  });
});

describe('instants', () => {
  it('converts a fixed-offset zone', () => {
    expect(toInstantMs('2026-10-13T09:00', RIYADH)).toBe(Date.UTC(2026, 9, 13, 6, 0));
    expect(fromInstantMs(Date.UTC(2026, 9, 13, 6, 0), RIYADH)).toBe('2026-10-13T09:00');
  });

  it('round-trips outside DST transitions', () => {
    for (const tz of [RIYADH, LONDON, NEW_YORK]) {
      const local = '2026-07-04T15:45';
      expect(fromInstantMs(toInstantMs(local, tz), tz)).toBe(local);
    }
  });

  it('London spring-forward: a time that does not exist moves forward', () => {
    // 01:30 on 2026-03-29 never happens in London (01:00 -> 02:00). It resolves to 02:30 BST,
    // which is 01:30 UTC.
    expect(toInstantMs('2026-03-29T01:30', LONDON)).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(fromInstantMs(Date.UTC(2026, 2, 29, 1, 30), LONDON)).toBe('2026-03-29T02:30');
  });

  it('London fall-back: an ambiguous time resolves to the earlier occurrence', () => {
    // 01:30 on 2026-10-25 happens twice. The earlier one is still BST (UTC+1) = 00:30 UTC.
    expect(toInstantMs('2026-10-25T01:30', LONDON)).toBe(Date.UTC(2026, 9, 25, 0, 30));
    // The later occurrence, 01:30 GMT = 01:30 UTC, also reads back as 01:30 local.
    expect(fromInstantMs(Date.UTC(2026, 9, 25, 1, 30), LONDON)).toBe('2026-10-25T01:30');
  });

  it('keeps wall-clock time stable across a DST change (the reason for D-005)', () => {
    // "09:00 London" is 09:00 local both before and after the clocks change, so the UTC
    // instant shifts by one hour.
    const before = toInstantMs('2026-10-24T09:00', LONDON);
    const after = toInstantMs('2026-10-26T09:00', LONDON);
    expect(after - before).toBe(2 * 24 * 60 * 60_000 + 60 * 60_000);
  });
});

describe('minutesBetween / addMinutes (real elapsed time)', () => {
  it('is 24h on an ordinary day', () => {
    expect(minutesBetween('2026-10-13T00:00', '2026-10-14T00:00', RIYADH)).toBe(1440);
  });

  it('is 23h on the spring-forward day', () => {
    expect(minutesBetween('2026-03-29T00:00', '2026-03-30T00:00', LONDON)).toBe(23 * 60);
    expect(minutesBetween('2026-03-08T00:00', '2026-03-09T00:00', NEW_YORK)).toBe(23 * 60);
  });

  it('is 25h on the fall-back day', () => {
    expect(minutesBetween('2026-10-25T00:00', '2026-10-26T00:00', LONDON)).toBe(25 * 60);
    expect(minutesBetween('2026-11-01T00:00', '2026-11-02T00:00', NEW_YORK)).toBe(25 * 60);
  });

  it('is negative when end is before start', () => {
    expect(minutesBetween('2026-10-13T10:00', '2026-10-13T09:00', RIYADH)).toBe(-60);
  });

  it('adds elapsed minutes across midnight', () => {
    expect(addMinutes('2026-10-13T23:30', 45, RIYADH)).toBe('2026-10-14T00:15');
    expect(addMinutes('2026-10-13T00:10', -20, RIYADH)).toBe('2026-10-12T23:50');
  });

  it('adds elapsed (not wall-clock) minutes across spring-forward', () => {
    // 00:30 GMT + 30 real minutes reaches 01:00 GMT, which becomes 02:00 BST; the remaining
    // 60 real minutes land at 03:00 BST. Wall-clock arithmetic would wrongly give 02:00.
    expect(addMinutes('2026-03-29T00:30', 90, LONDON)).toBe('2026-03-29T03:00');
  });
});

describe('now / today (injectable clock)', () => {
  it('uses the supplied time', () => {
    const noon = Date.UTC(2026, 9, 13, 9, 19); // 12:19 in Riyadh
    expect(nowLocal(RIYADH, noon)).toBe('2026-10-13T12:19');
    expect(todayIn(RIYADH, noon)).toBe('2026-10-13');
  });

  it('rolls over to the next day according to the zone, not UTC', () => {
    const lateUtc = Date.UTC(2026, 9, 13, 21, 30); // 00:30 on the 14th in Riyadh
    expect(todayIn(RIYADH, lateUtc)).toBe('2026-10-14');
    expect(todayIn('UTC', lateUtc)).toBe('2026-10-13');
    expect(todayIn(NEW_YORK, lateUtc)).toBe('2026-10-13');
  });
});
