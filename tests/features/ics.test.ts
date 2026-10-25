import { describe, expect, it } from 'vitest';
import { eventsToIcs, icsFileName, icsToEnvelope, importCalendarName } from '@/features/ics';
import { makeCalendar, makeEvent } from '../helpers/factories';

const options = { fileName: 'work.ics', zone: 'Asia/Riyadh', now: 5_000_000, calendarId: 'ics-cal' };
const file = (...events: string[][]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');

describe('icsToEnvelope', () => {
  it('refuses a file that is not a calendar, or has nothing to import', () => {
    expect(icsToEnvelope('hello', options)).toEqual({ ok: false, failure: 'not-ics' });
    const empty = icsToEnvelope(file(), options);
    expect(empty).toMatchObject({ ok: false, failure: 'no-events' });
  });

  it('puts every event into one new calendar named after the file', () => {
    const r = icsToEnvelope(
      file(
        ['UID:a', 'DTSTART:20261025T060000Z', 'DTEND:20261025T070000Z', 'SUMMARY:One'],
        ['UID:b', 'DTSTART;VALUE=DATE:20261026', 'SUMMARY:Two'],
      ),
      options,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.calendarName).toBe('work');
    expect(r.envelope.calendars).toHaveLength(1);
    expect(r.envelope.calendars[0]).toMatchObject({ id: 'ics-cal', name: 'work', visible: true });
    const rows = r.envelope.events.map((e) => [e.title, e.calendarId, e.allDay]);
    expect(rows).toContainEqual(['One', 'ics-cal', false]);
    expect(rows).toContainEqual(['Two', 'ics-cal', true]);
    expect(rows).toHaveLength(2);
  });

  it('is repeatable: the same file always gives the same ids and times', () => {
    const text = file(['UID:a', 'DTSTART:20261025T060000Z', 'SUMMARY:One']);
    const a = icsToEnvelope(text, options);
    const b = icsToEnvelope(text, { ...options, now: 9_999_999 });
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.envelope.events).toEqual(b.envelope.events);
    expect(a.envelope.events[0]?.id).toMatch(/^ics-[0-9a-z]+$/);
  });

  it('reuses the id of a file this app wrote, and ties an override to its series', () => {
    const series = makeEvent({ id: 'series', calendarId: 'c', rrule: 'FREQ=WEEKLY;COUNT=3' });
    const override = makeEvent({
      id: 'ovr',
      calendarId: 'c',
      start: '2026-10-20T11:00',
      end: '2026-10-20T12:00',
      seriesId: 'series',
      originalStart: '2026-10-20T09:00',
    });
    const text = eventsToIcs([makeCalendar({ id: 'c' })], [series, override]);
    const r = icsToEnvelope(text, options);
    if (!r.ok) throw new Error('expected ok');
    const ids = r.envelope.events.map((e) => e.id).sort();
    expect(ids).toEqual(['ovr', 'series']);
    expect(r.envelope.events.find((e) => e.id === 'ovr')).toMatchObject({
      seriesId: 'series',
      originalStart: '2026-10-20T09:00',
    });
    expect(r.envelope.events.find((e) => e.id === 'series')?.rrule).toBe('FREQ=WEEKLY;COUNT=3');
  });

  it('repairs an end before the start instead of failing the file', () => {
    const r = icsToEnvelope(
      file(
        ['UID:ok', 'DTSTART:20261025T060000Z', 'SUMMARY:fine'],
        ['UID:odd', 'DTSTART:20261025T060000Z', 'DTEND:20261024T060000Z', 'SUMMARY:odd'],
      ),
      options,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.envelope.events).toHaveLength(2);
    expect(r.envelope.events.find((e) => e.title === 'odd')?.end).toBe('2026-10-25T09:00');
    expect(r.report.invalid).toBe(0);
  });
});

describe('names', () => {
  it('prefers the calendar name in the file, then the file name without its extension', () => {
    expect(importCalendarName('Team', 'x.ics')).toBe('Team');
    expect(importCalendarName(undefined, 'My holidays.ics')).toBe('My holidays');
    expect(importCalendarName(undefined, '.ics')).toBe('ICS');
  });

  it('dates the export file by the person’s own calendar', () => {
    expect(icsFileName(Date.UTC(2026, 9, 25, 22, 0), 'Asia/Riyadh')).toBe('nawy-today-2026-10-26.ics');
  });
});
