// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { expandEvents } from '@/core/recurrence';
import { ValidationError } from '@/data';
import { execute, resolveTarget, undoBatch } from '@/features/events';
import { testStore } from '../helpers/db';

const base = {
  calendarId: 'id-1',
  title: 'Standup',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T09:30',
  tzid: 'Asia/Riyadh',
};

describe('execute', () => {
  it('reports ok with an undo token', async () => {
    const { store } = testStore();
    await store.createCalendar({ name: 'P', color: 'blue' });
    const out = await execute(store, [{ kind: 'create', event: base }]);
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(await undoBatch(store, out.undo)).toBe(true);
    expect(await store.listEvents()).toEqual([]);
  });

  it('maps stale and missing targets', async () => {
    const { store } = testStore();
    await store.createCalendar({ name: 'P', color: 'blue' });
    const e = await store.createEvent(base);
    await store.updateEvent(e.id, { title: 'x' });
    expect(
      await execute(store, [
        { kind: 'update', id: e.id, patch: {}, expectedUpdatedAt: e.updatedAt },
      ]),
    ).toEqual({ status: 'conflict' });
    expect(await execute(store, [{ kind: 'delete', id: 'nope' }])).toEqual({ status: 'not-found' });
  });

  it('maps a refused value to invalid and a storage failure to failed', async () => {
    const refusing = {
      applyOps: () => Promise.reject(new ValidationError('bad')),
    };
    expect(await execute(refusing, [])).toEqual({ status: 'invalid' });
    const broken = {
      applyOps: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
      undo: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
    };
    expect(await execute(broken, [])).toEqual({ status: 'failed' });
    expect(await undoBatch(broken, { restore: [], remove: [] })).toBe(false);
  });

  it('a failed write leaves the data exactly as it was', async () => {
    const { store, db } = testStore();
    await store.createCalendar({ name: 'P', color: 'blue' });
    const a = await store.createEvent(base);
    const out = await execute(store, [
      { kind: 'update', id: a.id, patch: { title: 'changed' } },
      { kind: 'create', event: { ...base, calendarId: 'no-such-calendar' } },
    ]);
    expect(out).toEqual({ status: 'invalid' });
    expect((await store.getEvent(a.id))?.title).toBe('Standup');
    expect(await db.events.count()).toBe(1);
  });
});

describe('resolveTarget', () => {
  it('finds the master, overrides and key for every kind of click', async () => {
    const { store } = testStore();
    await store.createCalendar({ name: 'P', color: 'blue' });
    const master = await store.createEvent({ ...base, rrule: 'FREQ=DAILY;COUNT=5' });
    const plain = await store.createEvent({
      ...base,
      title: 'Plain',
      start: '2026-11-01T09:00',
      end: '2026-11-01T10:00',
    });
    await store.createEvent({
      ...base,
      title: 'Moved',
      start: '2026-10-15T14:00',
      end: '2026-10-15T14:30',
      seriesId: master.id,
      originalStart: '2026-10-15T09:00',
    });
    const events = await store.listEvents();
    const occ = expandEvents(events, '2026-10-01', '2026-12-01').occurrences;
    const find = (pred: (o: (typeof occ)[number]) => boolean) => {
      const o = occ.find(pred);
      if (!o) throw new Error('occurrence not found');
      return o;
    };

    const plainT = resolveTarget(
      events,
      find((o) => o.event.id === plain.id),
    );
    expect(plainT.master.id).toBe(plain.id);
    expect(plainT.originalStart).toBeUndefined();

    const plainOccurrence = resolveTarget(
      events,
      find((o) => o.start === '2026-10-14T09:00'),
    );
    expect(plainOccurrence.master.id).toBe(master.id);
    expect(plainOccurrence.originalStart).toBe('2026-10-14T09:00');
    expect(plainOccurrence.override).toBeUndefined();
    expect(plainOccurrence.overrides).toHaveLength(1);

    const moved = resolveTarget(
      events,
      find((o) => o.event.title === 'Moved'),
    );
    expect(moved.master.id).toBe(master.id);
    expect(moved.override?.title).toBe('Moved');
    expect(moved.originalStart).toBe('2026-10-15T09:00');
  });

  it('treats an override whose series is gone as a plain event', async () => {
    const { store } = testStore();
    await store.createCalendar({ name: 'P', color: 'blue' });
    const orphan = await store.createEvent({
      ...base,
      seriesId: 'gone',
      originalStart: '2026-10-13T09:00',
    });
    const t = resolveTarget([orphan], {
      key: 'k',
      event: orphan,
      start: orphan.start,
      end: orphan.end,
      recurring: true,
      override: true,
    });
    expect(t).toEqual({ master: orphan, overrides: [] });
  });
});
