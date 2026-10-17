// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/data';
import { testStore } from '../helpers/db';

const timed = (over = {}) => ({
  calendarId: 'id-1',
  title: 'Standup',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T09:30',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function setup() {
  const ctx = testStore();
  await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  return ctx;
}

describe('applyOps', () => {
  it('applies create + update + delete in one batch', async () => {
    const { store } = await setup();
    const a = await store.createEvent(timed({ title: 'A' }));
    const b = await store.createEvent(timed({ title: 'B' }));
    const res = await store.applyOps([
      { kind: 'create', event: timed({ title: 'C' }) },
      { kind: 'update', id: a.id, patch: { title: 'A2' } },
      { kind: 'delete', id: b.id },
    ]);
    expect(res.status).toBe('ok');
    const titles = (await store.listEvents()).map((e) => e.title).sort();
    expect(titles).toEqual(['A2', 'C']);
  });

  it('writes nothing when a later step fails (not found)', async () => {
    const { store, db } = await setup();
    const a = await store.createEvent(timed({ title: 'A' }));
    const res = await store.applyOps([
      { kind: 'update', id: a.id, patch: { title: 'changed' } },
      { kind: 'create', event: timed({ title: 'new' }) },
      { kind: 'delete', id: 'missing' },
    ]);
    expect(res).toEqual({ status: 'not-found', id: 'missing' });
    expect((await store.getEvent(a.id))?.title).toBe('A');
    expect(await db.events.count()).toBe(1);
  });

  it('writes nothing when a step is stale (conflict)', async () => {
    const { store, db } = await setup();
    const a = await store.createEvent(timed({ title: 'A' }));
    await store.updateEvent(a.id, { title: 'from another tab' });
    const res = await store.applyOps([
      { kind: 'create', event: timed({ title: 'new' }) },
      { kind: 'update', id: a.id, patch: { title: 'mine' }, expectedUpdatedAt: a.updatedAt },
    ]);
    expect(res.status).toBe('conflict');
    expect((await store.getEvent(a.id))?.title).toBe('from another tab');
    expect(await db.events.count()).toBe(1);
  });

  it('rolls everything back when a step is invalid', async () => {
    const { store, db } = await setup();
    const a = await store.createEvent(timed({ title: 'A' }));
    await expect(
      store.applyOps([
        { kind: 'update', id: a.id, patch: { title: 'changed' } },
        { kind: 'create', event: timed({ start: '2026-10-13T10:00', end: '2026-10-13T09:00' }) },
      ]),
    ).rejects.toThrow(ValidationError);
    expect((await store.getEvent(a.id))?.title).toBe('A');
    expect(await db.events.count()).toBe(1);
  });

  it('clears a field set to undefined', async () => {
    const { store } = await setup();
    const a = await store.createEvent(timed({ rrule: 'FREQ=DAILY' }));
    const res = await store.applyOps([{ kind: 'update', id: a.id, patch: { rrule: undefined } }]);
    expect(res.status).toBe('ok');
    expect((await store.getEvent(a.id))?.rrule).toBeUndefined();
  });

  it('deleting a series also deletes its overrides', async () => {
    const { store } = await setup();
    const series = await store.createEvent(timed({ rrule: 'FREQ=DAILY' }));
    await store.createEvent(
      timed({
        seriesId: series.id,
        originalStart: '2026-10-14T09:00',
        start: '2026-10-14T11:00',
        end: '2026-10-14T11:30',
      }),
    );
    await store.applyOps([{ kind: 'delete', id: series.id }]);
    expect(await store.listEvents()).toEqual([]);
  });
});

describe('undo', () => {
  it('brings a deleted series and its overrides back, with higher updatedAt', async () => {
    const { store, clock } = await setup();
    const series = await store.createEvent(timed({ rrule: 'FREQ=DAILY' }));
    await store.createEvent(
      timed({
        seriesId: series.id,
        originalStart: '2026-10-14T09:00',
        start: '2026-10-14T11:00',
        end: '2026-10-14T11:30',
      }),
    );
    const res = await store.applyOps([{ kind: 'delete', id: series.id }]);
    if (res.status !== 'ok') throw new Error('expected ok');
    clock.advance(1000);
    expect(await store.undo(res.undo)).toBe(true);
    const events = await store.listEvents();
    expect(events).toHaveLength(2);
    const back = events.find((e) => e.id === series.id);
    expect(back?.title).toBe('Standup');
    expect(back?.rrule).toBe('FREQ=DAILY');
    expect(back?.deletedAt).toBeUndefined();
    expect(back!.updatedAt).toBeGreaterThan(series.updatedAt);
  });

  it('reverts an update and removes what the batch created', async () => {
    const { store } = await setup();
    const a = await store.createEvent(timed({ title: 'A', rrule: 'FREQ=DAILY' }));
    const res = await store.applyOps([
      { kind: 'update', id: a.id, patch: { title: 'A2', rrule: 'FREQ=DAILY;COUNT=3' } },
      { kind: 'create', event: timed({ title: 'tail' }) },
    ]);
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(await store.undo(res.undo)).toBe(true);
    const events = await store.listEvents();
    expect(events.map((e) => e.title)).toEqual(['A']);
    expect(events[0]?.rrule).toBe('FREQ=DAILY');
  });

  it('is a no-op the second time', async () => {
    const { store } = await setup();
    const a = await store.createEvent(timed());
    const res = await store.applyOps([{ kind: 'create', event: timed({ title: 'x' }) }]);
    if (res.status !== 'ok') throw new Error('expected ok');
    expect(await store.undo(res.undo)).toBe(true);
    expect(await store.undo({ ...res.undo, restore: [] })).toBe(false);
    expect(await store.getEvent(a.id)).toBeDefined();
  });
});
