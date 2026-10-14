// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LIMITS, parseCalendar, parseEvent } from '@/core/model';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../../helpers/factories';

function errorOf<T>(result: { ok: boolean; error?: string; value?: T }): string {
  expect(result.ok).toBe(false);
  return result.error ?? '';
}

describe('parseCalendar', () => {
  it('accepts a valid calendar and returns an equal copy', () => {
    const input = makeCalendar();
    const result = parseCalendar(input);
    expect(result).toEqual({ ok: true, value: input });
  });

  it('drops unknown fields', () => {
    const result = parseCalendar({ ...makeCalendar(), evil: 1, __proto__: { x: 1 } });
    expect(result.ok && Object.keys(result.value)).not.toContain('evil');
  });

  it('accepts hex colours and palette tokens', () => {
    expect(parseCalendar(makeCalendar({ color: '#3D7BFF' })).ok).toBe(true);
    expect(parseCalendar(makeCalendar({ color: 'sage-green' })).ok).toBe(true);
  });

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(parseCalendar(value).ok).toBe(false);
  });

  it.each([
    ['empty id', { id: '' }],
    ['empty name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(LIMITS.name + 1) }],
    ['bad colour', { color: 'url(javascript:alert(1))' }],
    ['non-boolean visible', { visible: 'yes' }],
    ['negative timestamp', { createdAt: -1 }],
    ['fractional timestamp', { updatedAt: 1.5 }],
    ['string timestamp', { updatedAt: '1' }],
  ])('rejects %s', (_label, over) => {
    expect(parseCalendar({ ...makeCalendar(), ...over }).ok).toBe(false);
  });

  it('requires a tombstone to have an empty name, and a live calendar to have one', () => {
    expect(parseCalendar(makeCalendar({ name: '', deletedAt: 5 })).ok).toBe(true);
    expect(parseCalendar(makeCalendar({ name: 'Work', deletedAt: 5 })).ok).toBe(false);
  });
});

describe('parseEvent: timed events', () => {
  it('accepts a valid event and returns an equal copy', () => {
    const input = makeEvent({ notes: 'n', location: 'l', color: '#112233' });
    expect(parseEvent(input)).toEqual({ ok: true, value: input });
  });

  it('allows an empty title (shown as a placeholder) and zero duration', () => {
    expect(parseEvent(makeEvent({ title: '' })).ok).toBe(true);
    expect(parseEvent(makeEvent({ start: '2026-10-13T09:00', end: '2026-10-13T09:00' })).ok).toBe(
      true,
    );
  });

  it('rejects an end before the start', () => {
    expect(errorOf(parseEvent(makeEvent({ end: '2026-10-13T08:59' })))).toMatch(/end/);
  });

  it('accepts an event that spans midnight', () => {
    expect(parseEvent(makeEvent({ start: '2026-10-13T23:00', end: '2026-10-14T01:00' })).ok).toBe(
      true,
    );
  });

  it.each([
    ['date instead of date-time', { start: '2026-10-13' }],
    ['seconds', { end: '2026-10-13T10:00:00' }],
    ['impossible date', { start: '2026-02-30T09:00', end: '2026-02-30T10:00' }],
    ['hour 24', { end: '2026-10-13T24:00' }],
  ])('rejects %s', (_label, over) => {
    expect(parseEvent(makeEvent(over)).ok).toBe(false);
  });

  it('requires a valid IANA time zone', () => {
    expect(parseEvent(makeEvent({ tzid: undefined })).ok).toBe(false);
    expect(parseEvent(makeEvent({ tzid: 'Mars/Olympus_Mons' })).ok).toBe(false);
    expect(parseEvent(makeEvent({ tzid: 'Europe/London' })).ok).toBe(true);
  });
});

describe('parseEvent: all-day events', () => {
  it('accepts a valid all-day event', () => {
    const input = makeAllDayEvent();
    expect(parseEvent(input)).toEqual({ ok: true, value: input });
  });

  it('requires the exclusive end to be after the start', () => {
    expect(parseEvent(makeAllDayEvent({ end: '2026-10-13' })).ok).toBe(false);
    expect(parseEvent(makeAllDayEvent({ end: '2026-10-12' })).ok).toBe(false);
    expect(parseEvent(makeAllDayEvent({ end: '2026-10-20' })).ok).toBe(true);
  });

  it('forbids a time zone and times', () => {
    expect(parseEvent(makeAllDayEvent({ tzid: 'Asia/Riyadh' })).ok).toBe(false);
    expect(parseEvent(makeAllDayEvent({ start: '2026-10-13T00:00' })).ok).toBe(false);
  });
});

describe('parseEvent: repetition fields', () => {
  it('accepts rrule and exdates that match the event type', () => {
    const timed = makeEvent({ rrule: 'FREQ=WEEKLY', exdates: ['2026-10-20T09:00'] });
    expect(parseEvent(timed).ok).toBe(true);
    const allDay = makeAllDayEvent({ rrule: 'FREQ=DAILY', exdates: ['2026-10-15'] });
    expect(parseEvent(allDay).ok).toBe(true);
  });

  it('rejects an exdate of the wrong form, or too many', () => {
    expect(parseEvent(makeEvent({ exdates: ['2026-10-20'] })).ok).toBe(false);
    expect(parseEvent(makeAllDayEvent({ exdates: ['2026-10-20T09:00'] })).ok).toBe(false);
    const many = Array.from({ length: LIMITS.exdates + 1 }, () => '2026-10-20T09:00');
    expect(parseEvent(makeEvent({ exdates: many })).ok).toBe(false);
    expect(parseEvent({ ...makeEvent(), exdates: 'nope' }).ok).toBe(false);
  });

  it('requires seriesId and originalStart together, and an override cannot repeat', () => {
    expect(parseEvent(makeEvent({ seriesId: 's-1' })).ok).toBe(false);
    expect(parseEvent(makeEvent({ originalStart: '2026-10-13T09:00' })).ok).toBe(false);
    expect(parseEvent(makeEvent({ seriesId: 's-1', originalStart: '2026-10-13T09:00' })).ok).toBe(
      true,
    );
    expect(
      parseEvent(
        makeEvent({ seriesId: 's-1', originalStart: '2026-10-13T09:00', rrule: 'FREQ=DAILY' }),
      ).ok,
    ).toBe(false);
  });
});

describe('parseEvent: limits and tombstones', () => {
  it('enforces length limits', () => {
    expect(parseEvent(makeEvent({ title: 'x'.repeat(LIMITS.title + 1) })).ok).toBe(false);
    expect(parseEvent(makeEvent({ notes: 'x'.repeat(LIMITS.notes + 1) })).ok).toBe(false);
    expect(parseEvent(makeEvent({ location: 'x'.repeat(LIMITS.location + 1) })).ok).toBe(false);
    expect(parseEvent(makeEvent({ rrule: 'x'.repeat(LIMITS.rrule + 1) })).ok).toBe(false);
  });

  it('accepts a bare tombstone', () => {
    const tombstone = makeEvent({ title: '', deletedAt: 7, updatedAt: 7 });
    expect(parseEvent(tombstone)).toEqual({ ok: true, value: tombstone });
  });

  it.each([
    ['a title', { title: 'secret' }],
    ['notes', { notes: 'secret' }],
    ['a location', { location: 'secret' }],
    ['a rule', { rrule: 'FREQ=DAILY' }],
    ['a colour', { color: 'red' }],
  ])('rejects a tombstone that keeps %s', (_label, over) => {
    expect(parseEvent(makeEvent({ title: '', deletedAt: 7, ...over })).ok).toBe(false);
  });

  it('does not store keys whose value is undefined', () => {
    const result = parseEvent(makeEvent({ notes: undefined, tzid: 'Asia/Riyadh' }));
    expect(result.ok && 'notes' in result.value).toBe(false);
  });

  it('turns a thrown surprise into a rejection only for validation errors', () => {
    expect(() =>
      parseEvent({
        get id(): never {
          throw new TypeError('boom');
        },
      }),
    ).toThrow('boom');
  });
});
