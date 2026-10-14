// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  nextUpdatedAt,
  parseCalendar,
  parseEvent,
  planMerge,
  recordsToWrite,
  tombstoneCalendar,
  tombstoneEvent,
  type Calendar,
} from '@/core/model';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../../helpers/factories';

describe('nextUpdatedAt', () => {
  it('uses the clock when it moved forward', () => {
    expect(nextUpdatedAt(100, 500)).toBe(500);
  });

  it('is strictly greater than the previous value even if the clock did not move', () => {
    expect(nextUpdatedAt(500, 500)).toBe(501);
  });

  it('is strictly greater even if the clock went backwards', () => {
    expect(nextUpdatedAt(500, 100)).toBe(501);
  });
});

describe('tombstones', () => {
  it('a calendar tombstone keeps no name, is hidden, and is valid', () => {
    const t = tombstoneCalendar(makeCalendar({ name: 'Work' }), 5_000_000_000_000);
    expect(t.name).toBe('');
    expect(t.visible).toBe(false);
    expect(t.deletedAt).toBe(t.updatedAt);
    expect(parseCalendar(t).ok).toBe(true);
  });

  it('an event tombstone keeps no content and is valid', () => {
    const live = makeEvent({
      notes: 'private',
      location: 'secret place',
      rrule: 'FREQ=DAILY',
      exdates: ['2026-10-14T09:00'],
      color: 'red',
    });
    const t = tombstoneEvent(live, live.updatedAt + 1000);
    expect(t).toEqual({
      id: live.id,
      calendarId: live.calendarId,
      title: '',
      allDay: false,
      start: live.start,
      end: live.end,
      tzid: live.tzid,
      createdAt: live.createdAt,
      updatedAt: live.updatedAt + 1000,
      deletedAt: live.updatedAt + 1000,
    });
    expect(parseEvent(t).ok).toBe(true);
  });

  it('an all-day tombstone has no tzid key at all', () => {
    const t = tombstoneEvent(makeAllDayEvent(), 9_000_000_000_000);
    expect('tzid' in t).toBe(false);
    expect(parseEvent(t).ok).toBe(true);
  });

  it('wins over the previous write even when the clock is behind', () => {
    const live = makeEvent({ updatedAt: 9_000 });
    expect(tombstoneEvent(live, 1_000).updatedAt).toBe(9_001);
  });
});

describe('planMerge', () => {
  const cal = (over: Partial<Calendar>) => makeCalendar(over);
  const local = (...records: Calendar[]) => new Map(records.map((r) => [r.id, r] as const));

  it('adds records that do not exist locally', () => {
    const plan = planMerge(local(), [cal({ id: 'a' })]);
    expect(plan.added.map((r) => r.id)).toEqual(['a']);
  });

  it('ignores older incoming records', () => {
    const plan = planMerge(local(cal({ id: 'a', updatedAt: 200 })), [
      cal({ id: 'a', updatedAt: 100 }),
    ]);
    expect(plan).toMatchObject({ older: 1, same: 0 });
    expect(recordsToWrite(plan)).toEqual([]);
  });

  it('updates with newer incoming records', () => {
    const plan = planMerge(local(cal({ id: 'a', updatedAt: 100 })), [
      cal({ id: 'a', updatedAt: 200, name: 'New' }),
    ]);
    expect(plan.updated.map((r) => r.name)).toEqual(['New']);
  });

  it('treats an identical timestamp as a no-op, so re-importing a file changes nothing', () => {
    const record = cal({ id: 'a', updatedAt: 100 });
    const plan = planMerge(local(record), [record]);
    expect(plan.same).toBe(1);
    expect(recordsToWrite(plan)).toEqual([]);
  });

  it('a newer tombstone deletes a live record', () => {
    const tomb = tombstoneCalendar(cal({ id: 'a', updatedAt: 100 }), 200);
    const plan = planMerge(local(cal({ id: 'a', updatedAt: 100 })), [tomb]);
    expect(plan.deleted).toEqual([tomb]);
  });

  it('an older tombstone does not delete a newer edit', () => {
    const tomb = tombstoneCalendar(cal({ id: 'a', updatedAt: 50 }), 60);
    const plan = planMerge(local(cal({ id: 'a', updatedAt: 100 })), [tomb]);
    expect(plan.older).toBe(1);
    expect(plan.deleted).toEqual([]);
  });

  it('a newer edit restores a record deleted earlier', () => {
    const tomb = tombstoneCalendar(cal({ id: 'a', updatedAt: 100 }), 150);
    const plan = planMerge(local(tomb), [cal({ id: 'a', updatedAt: 300, name: 'Back' })]);
    expect(plan.updated.map((r) => r.name)).toEqual(['Back']);
  });

  it('on an exact tie the tombstone wins', () => {
    const live = cal({ id: 'a', updatedAt: 100 });
    const tomb: Calendar = { ...tombstoneCalendar(live, 100), updatedAt: 100, deletedAt: 100 };
    expect(planMerge(local(live), [tomb]).deleted).toEqual([tomb]);
    // ...and a live record never beats an equal-aged tombstone.
    expect(planMerge(local(tomb), [live]).same).toBe(1);
  });

  it('stores a tombstone for an unknown id, so an older live copy cannot resurrect it later', () => {
    const tomb = tombstoneCalendar(cal({ id: 'a' }), 500);
    const plan = planMerge(local(), [tomb]);
    expect(plan.tombstones).toEqual([tomb]);
    expect(recordsToWrite(plan)).toEqual([tomb]);
  });

  it('keeps the newer of two tombstones', () => {
    const old = tombstoneCalendar(cal({ id: 'a', updatedAt: 100 }), 200);
    const newer = tombstoneCalendar(cal({ id: 'a', updatedAt: 100 }), 900);
    expect(planMerge(local(old), [newer]).tombstones).toEqual([newer]);
  });

  it('covers every outcome in one pass', () => {
    const plan = planMerge(
      local(
        cal({ id: 'same', updatedAt: 10 }),
        cal({ id: 'older', updatedAt: 10 }),
        cal({ id: 'upd', updatedAt: 10 }),
        cal({ id: 'del', updatedAt: 10 }),
      ),
      [
        cal({ id: 'same', updatedAt: 10 }),
        cal({ id: 'older', updatedAt: 5 }),
        cal({ id: 'upd', updatedAt: 20 }),
        tombstoneCalendar(cal({ id: 'del', updatedAt: 10 }), 20),
        cal({ id: 'new', updatedAt: 1 }),
      ],
    );
    expect({
      added: plan.added.map((r) => r.id),
      updated: plan.updated.map((r) => r.id),
      deleted: plan.deleted.map((r) => r.id),
      same: plan.same,
      older: plan.older,
    }).toEqual({ added: ['new'], updated: ['upd'], deleted: ['del'], same: 1, older: 1 });
  });
});
