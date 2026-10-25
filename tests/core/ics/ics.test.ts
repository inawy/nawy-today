import { describe, expect, it } from 'vitest';
import { parseIcs, serializeIcs } from '@/core/ics';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../../helpers/factories';

const file = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
const event = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const ZONE = 'Asia/Riyadh';

describe('parseIcs', () => {
  it('refuses text that is not a calendar', () => {
    expect(parseIcs('hello', { zone: ZONE }).isCalendar).toBe(false);
  });

  it('reads a timed event in its own zone, with text unescaped', () => {
    const r = parseIcs(
      file(
        'X-WR-CALNAME:Work',
        event(
          'UID:a1',
          'DTSTART;TZID=Europe/London:20261025T090000',
          'DTEND;TZID=Europe/London:20261025T103000',
          'SUMMARY:Plan\\, review',
          'LOCATION:Room 2',
          'DESCRIPTION:line1\\nline2',
        ),
      ),
      { zone: ZONE },
    );
    expect(r.name).toBe('Work');
    expect(r.events).toEqual([
      {
        uid: 'a1',
        title: 'Plan, review',
        notes: 'line1\nline2',
        location: 'Room 2',
        allDay: false,
        start: '2026-10-25T09:00',
        end: '2026-10-25T10:30',
        tzid: 'Europe/London',
        exdates: [],
      },
    ]);
  });

  it('turns a UTC time into the wall time of the person’s zone', () => {
    const r = parseIcs(
      file(event('UID:u', 'DTSTART:20261025T060000Z', 'DTEND:20261025T070000Z', 'SUMMARY:x')),
      { zone: ZONE },
    );
    expect(r.events[0]).toMatchObject({
      start: '2026-10-25T09:00',
      end: '2026-10-25T10:00',
      tzid: ZONE,
    });
  });

  it('reads a floating time in the person’s zone', () => {
    const r = parseIcs(file(event('UID:f', 'DTSTART:20261025T090000', 'SUMMARY:x')), {
      zone: ZONE,
    });
    expect(r.events[0]).toMatchObject({ start: '2026-10-25T09:00', end: '2026-10-25T09:00' });
  });

  it('reads all-day events with an exclusive end, a duration, or nothing', () => {
    const r = parseIcs(
      file(
        event('UID:1', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261028', 'SUMMARY:a'),
        event('UID:2', 'DTSTART;VALUE=DATE:20261025', 'DURATION:P2D', 'SUMMARY:b'),
        event('UID:3', 'DTSTART;VALUE=DATE:20261025', 'SUMMARY:c'),
      ),
      { zone: ZONE },
    );
    expect(r.events.map((e) => [e.allDay, e.start, e.end, e.tzid])).toEqual([
      [true, '2026-10-25', '2026-10-28', undefined],
      [true, '2026-10-25', '2026-10-27', undefined],
      [true, '2026-10-25', '2026-10-26', undefined],
    ]);
  });

  it('adds a DURATION to a timed event', () => {
    const r = parseIcs(
      file(event('UID:d', 'DTSTART;TZID=Asia/Riyadh:20261025T090000', 'DURATION:PT1H30M', 'SUMMARY:x')),
      { zone: ZONE },
    );
    expect(r.events[0]?.end).toBe('2026-10-25T10:30');
  });

  it('keeps a supported repeat rule with its exceptions, and an override of one day', () => {
    const r = parseIcs(
      file(
        event(
          'UID:s',
          'DTSTART;TZID=Asia/Riyadh:20261025T090000',
          'DTEND;TZID=Asia/Riyadh:20261025T100000',
          'RRULE:FREQ=WEEKLY;COUNT=4',
          'EXDATE;TZID=Asia/Riyadh:20261101T090000',
          'SUMMARY:Standup',
        ),
        event(
          'UID:s',
          'RECURRENCE-ID;TZID=Asia/Riyadh:20261108T090000',
          'DTSTART;TZID=Asia/Riyadh:20261108T110000',
          'DTEND;TZID=Asia/Riyadh:20261108T120000',
          'SUMMARY:Standup (moved)',
        ),
      ),
      { zone: ZONE },
    );
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toMatchObject({ rrule: 'FREQ=WEEKLY;COUNT=4', exdates: ['2026-11-01T09:00'] });
    expect(r.events[1]).toMatchObject({ originalStart: '2026-11-08T09:00', start: '2026-11-08T11:00' });
  });

  it('moves a UTC UNTIL into the event’s zone', () => {
    const r = parseIcs(
      file(
        event(
          'UID:u',
          'DTSTART;TZID=Asia/Riyadh:20261025T090000',
          'RRULE:FREQ=DAILY;UNTIL=20261030T060000Z',
          'SUMMARY:x',
        ),
      ),
      { zone: ZONE },
    );
    expect(r.events[0]?.rrule).toBe('FREQ=DAILY;UNTIL=20261030T090000');
  });

  it('counts what it cannot honour instead of dropping it silently', () => {
    const r = parseIcs(
      file(
        event('UID:no-start', 'SUMMARY:x'),
        event('UID:c', 'STATUS:CANCELLED', 'DTSTART:20261025T090000', 'SUMMARY:x'),
        event('UID:hourly', 'DTSTART:20261025T090000', 'RRULE:FREQ=HOURLY', 'SUMMARY:x'),
        event('UID:tz', 'DTSTART;TZID=Mars/Olympus:20261025T090000', 'SUMMARY:x'),
        event(
          'UID:al',
          'DTSTART:20261025T090000',
          'SUMMARY:x',
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'TRIGGER:-PT10M',
          'END:VALARM',
        ),
        'BEGIN:VTODO\r\nUID:t\r\nSUMMARY:todo\r\nEND:VTODO',
        event('UID:gone', 'RECURRENCE-ID:20261101T090000', 'DTSTART:20261101T100000', 'SUMMARY:x'),
      ),
      { zone: ZONE },
    );
    expect(r.report).toEqual({
      unreadable: 1,
      cancelled: 1,
      orphanOverrides: 1,
      ruleDropped: 1,
      unknownZone: 1,
      alarms: 1,
      otherComponents: 1,
    });
    // Unreadable, cancelled and orphan ones are gone; the other three are kept.
    expect(r.events.map((e) => e.uid)).toEqual(['hourly', 'tz', 'al']);
    expect(r.events[0]?.rrule).toBeUndefined();
  });
});

describe('serializeIcs', () => {
  const calendars = [makeCalendar({ id: 'c', name: 'Home, sweet' })];

  it('writes a valid calendar with zones, all-day dates and no alarms', () => {
    const text = serializeIcs({
      calendars,
      events: [
        makeEvent({
          id: 'e1',
          calendarId: 'c',
          title: 'Lunch; with Ali',
          location: 'Cafe',
          notes: 'a\nb',
          updatedAt: 0,
        }),
        makeAllDayEvent({ id: 'e2', calendarId: 'c', title: 'Trip', updatedAt: 0 }),
      ],
    });
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('UID:e1@nawy-today');
    expect(text).toContain('DTSTAMP:19700101T000000Z');
    expect(text).toContain('DTSTART;TZID=Asia/Riyadh:20261013T090000');
    expect(text).toContain('DTEND;TZID=Asia/Riyadh:20261013T100000');
    expect(text).toContain('SUMMARY:Lunch\; with Ali');
    expect(text).toContain('DESCRIPTION:a\\nb');
    expect(text).toContain('CATEGORIES:Home\\, sweet');
    expect(text).toContain('DTSTART;VALUE=DATE:20261013');
    expect(text).toContain('DTEND;VALUE=DATE:20261014');
    expect(text).not.toContain('VALARM');
  });

  it('leaves out deleted events and overrides whose series is gone', () => {
    const text = serializeIcs({
      calendars,
      events: [
        makeEvent({ id: 'gone', calendarId: 'c', title: '', deletedAt: 5 }),
        makeEvent({ id: 'o', calendarId: 'c', seriesId: 'missing', originalStart: '2026-10-13T09:00' }),
        makeEvent({ id: 'x', calendarId: 'unknown' }),
      ],
    });
    expect(text).not.toContain('BEGIN:VEVENT');
  });

  it('reads back what it wrote, repeats and overrides included', () => {
    const series = makeEvent({
      id: 'series',
      calendarId: 'c',
      title: 'Standup',
      rrule: 'FREQ=WEEKLY;COUNT=4',
      exdates: ['2026-10-20T09:00'],
    });
    const override = makeEvent({
      id: 'ovr',
      calendarId: 'c',
      title: 'Standup (moved)',
      start: '2026-10-27T11:00',
      end: '2026-10-27T12:00',
      seriesId: 'series',
      originalStart: '2026-10-27T09:00',
    });
    const back = parseIcs(serializeIcs({ calendars, events: [series, override] }), { zone: ZONE });
    expect(back.report.unreadable + back.report.orphanOverrides + back.report.ruleDropped).toBe(0);
    expect(back.events).toHaveLength(2);
    const [s, o] = back.events;
    expect(s).toMatchObject({
      uid: 'series@nawy-today',
      nawyId: 'series',
      title: 'Standup',
      start: '2026-10-13T09:00',
      rrule: 'FREQ=WEEKLY;COUNT=4',
      exdates: ['2026-10-20T09:00'],
    });
    expect(o).toMatchObject({
      uid: 'series@nawy-today',
      nawyId: 'ovr',
      originalStart: '2026-10-27T09:00',
      start: '2026-10-27T11:00',
    });
  });
});
