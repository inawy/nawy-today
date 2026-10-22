import { describe, expect, it } from 'vitest';
import { describeWhen } from '@/features/events';

const en = { locale: 'en', hour12: false };

describe('describeWhen', () => {
  it('names a one-day all-day event by its date only', () => {
    expect(
      describeWhen({ start: '2026-10-20', end: '2026-10-21', allDay: true }, en, 'Asia/Riyadh'),
    ).toBe('Tuesday, October 20, 2026');
  });

  it('shows the last real day of a multi-day all-day event (the end is exclusive)', () => {
    const text = describeWhen(
      { start: '2026-10-20', end: '2026-10-23', allDay: true },
      en,
      'Asia/Riyadh',
    );
    expect(text).toContain('October 20');
    expect(text).toContain('October 22');
    expect(text).not.toContain('October 23');
  });

  it('gives date and times for a same-day event, without a zone when it is the local one', () => {
    const text = describeWhen(
      { start: '2026-10-20T09:00', end: '2026-10-20T10:30', allDay: false, tzid: 'Asia/Riyadh' },
      en,
      'Asia/Riyadh',
    );
    expect(text).toBe('Tuesday, October 20, 2026 · 09:00 – 10:30');
  });

  it('names the zone when it differs from the local one', () => {
    const text = describeWhen(
      { start: '2026-10-20T09:00', end: '2026-10-20T10:00', allDay: false, tzid: 'Europe/Paris' },
      en,
      'Asia/Riyadh',
    );
    expect(text.endsWith('(Europe/Paris)')).toBe(true);
  });

  it('gives both dates when an event crosses midnight', () => {
    const text = describeWhen(
      { start: '2026-10-20T22:00', end: '2026-10-21T01:00', allDay: false, tzid: 'Asia/Riyadh' },
      en,
      'Asia/Riyadh',
    );
    expect(text).toContain('October 20');
    expect(text).toContain('October 21');
  });
});
