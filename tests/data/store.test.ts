// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/data';
import { DAY, T0 } from '../helpers/factories';
import { testStore } from '../helpers/db';

const timed = (over = {}) => ({
  calendarId: 'id-1',
  title: 'Meeting',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T10:00',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function withCalendar() {
  const ctx = testStore();
  const calendar = await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  return { ...ctx, calendar };
}

describe('calendars', () => {
  it('creates and persists a calendar', async () => {
    const { store, db, calendar } = await withCalendar();
    expect(calendar).toEqual({
      id: 'id-1',
      name: 'Personal',
      color: 'blue',
      visible: true,
      createdAt: T0,
      updatedAt: T0,
    });
    expect(await db.calendars.get('id-1')).toEqual(calendar);
    expect(await store.listCalendars()).toEqual([calendar]);
  });

  it('rejects invalid input without writing anything', async () => {
    const { store, db } = testStore();
    await expect(store.createCalendar({ name: '  ', color: 'blue' })).rejects.toThrow(
      ValidationError,
    );
    await expect(store.createCalendar({ name: 'x', color: 'javascript:1' })).rejects.toThrow(
      ValidationError,
    );
    expect(await db.calendars.count()).toBe(0);
  });

  it('updates, bumping updatedAt even when the clock has not moved', async () => {
    const { store, calendar } = await withCalendar();
    const result = await store.updateCalendar(calendar.id, { name: 'Home' });
    expect(result).toMatchObject({ status: 'ok', value: { name: 'Home', updatedAt: T0 + 1 } });
  });

  it('refuses a stale update and returns the current record', async () => {
    const { store, calendar, clock } = await withCalendar();
    clock.advance(1000);
    await store.updateCalendar(calendar.id, { name: 'Edited in another tab' });
    const stale = await store.updateCalendar(
      calendar.id,
      { name: 'Mine' },
      { expectedUpdatedAt: calendar.updatedAt },
    );
    expect(stale).toMatchObject({ status: 'conflict', current: { name: 'Edited in another tab' } });
    expect((await store.getCalendar(calendar.id))?.name).toBe('Edited in another tab');
  });

  it('reports not-found for a missing or deleted calendar', async () => {
    const { store, calendar } = await withCalendar();
    expect(await store.updateCalendar('nope', { name: 'x' })).toEqual({ status: 'not-found' });
    await store.deleteCalendar(calendar.id);
    expect(await store.updateCalendar(calendar.id, { name: 'x' })).toEqual({ status: 'not-found' });
  });

  it('deleting writes a tombstone, hides the calendar, and cascades to its events', async () => {
    const { store, db, calendar, clock } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id, notes: 'private' }));
    clock.advance(5000);

    expect(await store.deleteCalendar(calendar.id)).toBe(true);

    const rawCalendar = await db.calendars.get(calendar.id);
    expect(rawCalendar).toMatchObject({ name: '', visible: false, deletedAt: T0 + 5000 });
    const rawEvent = await db.events.get(event.id);
    expect(rawEvent).toMatchObject({ title: '', deletedAt: T0 + 5000 });
    expect(rawEvent && 'notes' in rawEvent).toBe(false);

    expect(await store.listCalendars()).toEqual([]);
    expect(await store.listEvents()).toEqual([]);
    expect(await store.getCalendar(calendar.id)).toBeUndefined();
  });

  it('deleting twice is a no-op that says so', async () => {
    const { store, calendar } = await withCalendar();
    expect(await store.deleteCalendar(calendar.id)).toBe(true);
    expect(await store.deleteCalendar(calendar.id)).toBe(false);
    expect(await store.deleteCalendar('never-existed')).toBe(false);
  });
});

describe('events', () => {
  it('creates and persists an event', async () => {
    const { store, db, calendar } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id, location: 'Riyadh' }));
    expect(event).toMatchObject({
      id: 'id-2',
      calendarId: calendar.id,
      title: 'Meeting',
      location: 'Riyadh',
      createdAt: T0,
      updatedAt: T0,
    });
    expect(await db.events.get(event.id)).toEqual(event);
    expect(await store.getEvent(event.id)).toEqual(event);
  });

  it('rejects an unknown or deleted calendar', async () => {
    const { store, calendar, db } = await withCalendar();
    await expect(store.createEvent(timed({ calendarId: 'ghost' }))).rejects.toThrow(/calendar/);
    await store.deleteCalendar(calendar.id);
    await expect(store.createEvent(timed({ calendarId: calendar.id }))).rejects.toThrow(/calendar/);
    expect(await db.events.count()).toBe(0);
  });

  it('rejects invalid events without writing anything', async () => {
    const { store, db, calendar } = await withCalendar();
    const cal = { calendarId: calendar.id };
    await expect(store.createEvent(timed({ ...cal, end: '2026-10-13T08:00' }))).rejects.toThrow(
      ValidationError,
    );
    await expect(store.createEvent(timed({ ...cal, tzid: 'Nowhere/Land' }))).rejects.toThrow(
      ValidationError,
    );
    await expect(store.createEvent(timed({ ...cal, title: 'x'.repeat(10_000) }))).rejects.toThrow(
      ValidationError,
    );
    expect(await db.events.count()).toBe(0);
  });

  it('creates an all-day event', async () => {
    const { store, calendar } = await withCalendar();
    const event = await store.createEvent({
      calendarId: calendar.id,
      title: 'Holiday',
      allDay: true,
      start: '2026-10-13',
      end: '2026-10-14',
    });
    expect(event.allDay).toBe(true);
    expect('tzid' in event).toBe(false);
  });

  it('updates fields and bumps updatedAt', async () => {
    const { store, calendar, clock } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id }));
    clock.advance(DAY);
    const result = await store.updateEvent(event.id, { title: 'Renamed', location: 'Jeddah' });
    expect(result).toMatchObject({
      status: 'ok',
      value: { title: 'Renamed', location: 'Jeddah', createdAt: T0, updatedAt: T0 + DAY },
    });
  });

  it('never lets updatedAt stand still or go back', async () => {
    const { store, calendar, clock } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id }));
    const first = await store.updateEvent(event.id, { title: 'a' });
    clock.set(T0 - DAY); // clock stepped back
    const second = await store.updateEvent(event.id, { title: 'b' });
    expect(first.status === 'ok' && first.value.updatedAt).toBe(T0 + 1);
    expect(second.status === 'ok' && second.value.updatedAt).toBe(T0 + 2);
  });

  it('clears an optional field when it is set to undefined', async () => {
    const { store, db, calendar } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id, notes: 'remove me' }));
    await store.updateEvent(event.id, { notes: undefined });
    const stored = await db.events.get(event.id);
    expect(stored && 'notes' in stored).toBe(false);
  });

  it('rejects an invalid update and leaves the stored event untouched', async () => {
    const { store, db, calendar } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id }));
    await expect(store.updateEvent(event.id, { end: '2020-01-01T00:00' })).rejects.toThrow(
      ValidationError,
    );
    expect(await db.events.get(event.id)).toEqual(event);
  });

  it('converts a timed event to all-day when the fields are consistent', async () => {
    const { store, calendar } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id }));
    const result = await store.updateEvent(event.id, {
      allDay: true,
      start: '2026-10-13',
      end: '2026-10-14',
      tzid: undefined,
    });
    expect(result).toMatchObject({ status: 'ok', value: { allDay: true } });
  });

  it('moves an event to another live calendar, but not to a deleted or unknown one', async () => {
    const { store, calendar } = await withCalendar();
    const other = await store.createCalendar({ name: 'Work', color: 'red' });
    const dead = await store.createCalendar({ name: 'Old', color: 'gray' });
    await store.deleteCalendar(dead.id);
    const event = await store.createEvent(timed({ calendarId: calendar.id }));

    expect(await store.updateEvent(event.id, { calendarId: other.id })).toMatchObject({
      status: 'ok',
      value: { calendarId: other.id },
    });
    await expect(store.updateEvent(event.id, { calendarId: dead.id })).rejects.toThrow(/calendar/);
    await expect(store.updateEvent(event.id, { calendarId: 'ghost' })).rejects.toThrow(/calendar/);
  });

  it('refuses a stale update and reports not-found for a missing event', async () => {
    const { store, calendar, clock } = await withCalendar();
    const event = await store.createEvent(timed({ calendarId: calendar.id }));
    clock.advance(1000);
    await store.updateEvent(event.id, { title: 'Other tab' });

    const stale = await store.updateEvent(
      event.id,
      { title: 'Mine' },
      { expectedUpdatedAt: event.updatedAt },
    );
    expect(stale).toMatchObject({ status: 'conflict', current: { title: 'Other tab' } });
    expect(await store.updateEvent('missing', { title: 'x' })).toEqual({ status: 'not-found' });
  });

  it('deleting writes a content-free tombstone and hides the event', async () => {
    const { store, db, calendar, clock } = await withCalendar();
    const event = await store.createEvent(
      timed({ calendarId: calendar.id, notes: 'private', location: 'secret', color: 'red' }),
    );
    clock.advance(1000);

    expect(await store.deleteEvent(event.id)).toBe(true);

    const raw = await db.events.get(event.id);
    expect(raw).toEqual({
      id: event.id,
      calendarId: calendar.id,
      title: '',
      allDay: false,
      start: event.start,
      end: event.end,
      tzid: 'Asia/Riyadh',
      createdAt: T0,
      updatedAt: T0 + 1000,
      deletedAt: T0 + 1000,
    });
    expect(await store.getEvent(event.id)).toBeUndefined();
    expect(await store.listEvents()).toEqual([]);
    expect(await store.deleteEvent(event.id)).toBe(false);
  });

  it('deleting a repeating event also deletes the overrides of its occurrences', async () => {
    const { store, db, calendar } = await withCalendar();
    const series = await store.createEvent(timed({ calendarId: calendar.id, rrule: 'FREQ=DAILY' }));
    const override = await store.createEvent(
      timed({ calendarId: calendar.id, seriesId: series.id, originalStart: '2026-10-14T09:00' }),
    );
    const unrelated = await store.createEvent(timed({ calendarId: calendar.id }));

    await store.deleteEvent(series.id);

    expect((await db.events.get(override.id))?.deletedAt).toBeDefined();
    expect((await store.listEvents()).map((e) => e.id)).toEqual([unrelated.id]);
  });

  it('lists live events by start, all-day first within a day', async () => {
    const { store, calendar } = await withCalendar();
    const c = calendar.id;
    const late = await store.createEvent(
      timed({ calendarId: c, start: '2026-10-13T15:00', end: '2026-10-13T16:00' }),
    );
    const early = await store.createEvent(
      timed({ calendarId: c, start: '2026-10-13T08:00', end: '2026-10-13T09:00' }),
    );
    const allDay = await store.createEvent({
      calendarId: c,
      title: 'Holiday',
      allDay: true,
      start: '2026-10-13',
      end: '2026-10-14',
    });
    const nextDay = await store.createEvent(
      timed({ calendarId: c, start: '2026-10-14T01:00', end: '2026-10-14T02:00' }),
    );

    expect((await store.listEvents()).map((e) => e.id)).toEqual([
      allDay.id,
      early.id,
      late.id,
      nextDay.id,
    ]);
  });
});
