// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseEnvelope, serializeEnvelope } from '@/core/model';
import { TOMBSTONE_RETENTION_DAYS, exportEnvelope, purgeExpiredTombstones } from '@/data';
import { DAY } from '../helpers/factories';
import { testStore } from '../helpers/db';

const event = (calendarId: string, title: string) => ({
  calendarId,
  title,
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T10:00',
  tzid: 'Asia/Riyadh',
});

describe('purgeExpiredTombstones', () => {
  it('removes nothing before the retention period is over', async () => {
    const { store, db, clock } = testStore();
    const calendar = await store.createCalendar({ name: 'A', color: 'blue' });
    const doomed = await store.createEvent(event(calendar.id, 'x'));
    await store.deleteEvent(doomed.id);

    clock.advance((TOMBSTONE_RETENTION_DAYS - 1) * DAY);
    expect(await purgeExpiredTombstones(db, clock.now)).toEqual({ events: 0, calendars: 0 });
    expect(await db.events.get(doomed.id)).toBeDefined();
  });

  it('removes tombstones older than the retention period, and only those', async () => {
    const { store, db, clock } = testStore();
    const calendar = await store.createCalendar({ name: 'A', color: 'blue' });
    const old = await store.createEvent(event(calendar.id, 'old'));
    const live = await store.createEvent(event(calendar.id, 'live'));
    await store.deleteEvent(old.id);

    clock.advance(10 * DAY);
    const recent = await store.createEvent(event(calendar.id, 'recent'));
    await store.deleteEvent(recent.id);

    clock.advance((TOMBSTONE_RETENTION_DAYS - 9) * DAY); // 'old' is now 181 days old, 'recent' 171
    expect(await purgeExpiredTombstones(db, clock.now)).toEqual({ events: 1, calendars: 0 });

    expect(await db.events.get(old.id)).toBeUndefined();
    expect(await db.events.get(recent.id)).toBeDefined();
    expect(await db.events.get(live.id)).toBeDefined(); // live records are never purged
  });

  it('keeps a calendar tombstone while an event tombstone still points at it', async () => {
    const { store, db, clock } = testStore();
    const calendar = await store.createCalendar({ name: 'A', color: 'blue' });
    await store.deleteCalendar(calendar.id); // calendar tombstone written on day 0

    clock.advance(100 * DAY);
    await db.events.put({
      id: 'late-tombstone',
      calendarId: calendar.id,
      title: '',
      allDay: false,
      start: '2026-10-13T09:00',
      end: '2026-10-13T10:00',
      tzid: 'Asia/Riyadh',
      createdAt: clock.now(),
      updatedAt: clock.now(),
      deletedAt: clock.now(), // day 100
    });

    clock.advance(100 * DAY); // day 200: the calendar tombstone has expired, the event's has not
    expect(await purgeExpiredTombstones(db, clock.now)).toEqual({ events: 0, calendars: 0 });
    expect(await db.calendars.get(calendar.id)).toBeDefined();

    clock.advance(100 * DAY); // day 300: the event tombstone has expired too
    expect(await purgeExpiredTombstones(db, clock.now)).toEqual({ events: 1, calendars: 1 });
    expect(await db.calendars.get(calendar.id)).toBeUndefined();
  });

  it('removes a calendar tombstone together with its expired event tombstones', async () => {
    const { store, db, clock } = testStore();
    const calendar = await store.createCalendar({ name: 'A', color: 'blue' });
    await store.createEvent(event(calendar.id, 'x'));
    await store.deleteCalendar(calendar.id);

    clock.advance((TOMBSTONE_RETENTION_DAYS + 1) * DAY);
    expect(await purgeExpiredTombstones(db, clock.now)).toEqual({ events: 1, calendars: 1 });
    expect(await db.calendars.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
  });

  it('never leaves an export that cannot be imported again', async () => {
    const { store, db, clock } = testStore();
    const kept = await store.createCalendar({ name: 'Kept', color: 'blue' });
    const dropped = await store.createCalendar({ name: 'Dropped', color: 'red' });
    await store.createEvent(event(kept.id, 'stays'));
    await store.createEvent(event(dropped.id, 'goes'));
    await store.deleteCalendar(dropped.id);

    clock.advance(TOMBSTONE_RETENTION_DAYS * DAY + 1);
    await purgeExpiredTombstones(db, clock.now);

    const parsed = parseEnvelope(serializeEnvelope(await exportEnvelope(db, clock.now())));
    expect(parsed.ok).toBe(true);
  });
});
