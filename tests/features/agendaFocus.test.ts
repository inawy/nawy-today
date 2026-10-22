import { describe, expect, it } from 'vitest';
import {
  buildAgendaModel,
  minuteOfNow,
  nextItemKey,
  progressOf,
  untilLabel,
} from '@/features/agenda';
import type { AgendaItem } from '@/features/agenda';
import { makeCalendar, makeEvent } from '../helpers/factories';

const cal = makeCalendar({ id: 'c1' });
const model = (nowLocal: string, date = '2026-10-20') =>
  buildAgendaModel({
    calendars: [cal],
    events: [
      makeEvent({
        id: 'a',
        calendarId: 'c1',
        title: 'Done',
        start: '2026-10-20T08:00',
        end: '2026-10-20T09:00',
        tzid: 'Asia/Riyadh',
      }),
      makeEvent({
        id: 'b',
        calendarId: 'c1',
        title: 'Now',
        start: '2026-10-20T10:00',
        end: '2026-10-20T11:00',
        tzid: 'Asia/Riyadh',
      }),
      makeEvent({
        id: 'c',
        calendarId: 'c1',
        title: 'Next',
        start: '2026-10-20T13:00',
        end: '2026-10-20T14:00',
        tzid: 'Asia/Riyadh',
      }),
      makeEvent({
        id: 'd',
        calendarId: 'c1',
        title: 'Later',
        start: '2026-10-20T16:00',
        end: '2026-10-20T17:00',
        tzid: 'Asia/Riyadh',
      }),
    ],
    date,
    nowLocal,
  });

const title = (m: ReturnType<typeof model>, key: string | undefined) =>
  m.items.find((i) => i.key === key)?.occurrence.event.title;

describe('nextItemKey', () => {
  it('is the first timed event still ahead', () => {
    const m = model('2026-10-20T10:30');
    expect(title(m, nextItemKey(m))).toBe('Next');
  });

  it('is nothing on a day that is not today', () => {
    expect(nextItemKey(model('2026-10-21T10:30'))).toBeUndefined();
  });

  it('is nothing once everything has finished', () => {
    expect(nextItemKey(model('2026-10-20T20:00'))).toBeUndefined();
  });
});

describe('progressOf', () => {
  it('measures how far through the running event we are', () => {
    const m = model('2026-10-20T10:15');
    const running = m.items.find((i) => i.status === 'now') as AgendaItem;
    expect(progressOf(running, minuteOfNow('2026-10-20T10:15'))).toBeCloseTo(0.25);
  });

  it('is zero for events that are not running', () => {
    const m = model('2026-10-20T10:15');
    const later = m.items.find((i) => i.status === 'upcoming') as AgendaItem;
    expect(progressOf(later, 615)).toBe(0);
  });
});

describe('untilLabel', () => {
  it('speaks in minutes under an hour and hours beyond', () => {
    expect(untilLabel(40, 'en')).toBe('in 40 minutes');
    expect(untilLabel(150, 'en')).toBe('in 2 hours');
  });

  it('is empty when the time has come, and uses Arabic digits on request', () => {
    expect(untilLabel(0, 'en')).toBe('');
    expect(untilLabel(5, 'ar', 'arab')).toMatch(/[٠-٩]/);
  });
});
