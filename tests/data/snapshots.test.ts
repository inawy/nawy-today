// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildEnvelope, serializeEnvelope } from '@/core/model';
import {
  KEEP_SNAPSHOTS,
  exportEnvelope,
  getSnapshotEnvelope,
  importWithSafetySnapshot,
  listSnapshots,
  maybeTakeDailySnapshot,
  pruneSnapshots,
  snapshotBudgetBytes,
  takeSnapshot,
} from '@/data';
import { DAY, T0, makeCalendar, makeEvent } from '../helpers/factories';
import { testSnapshotDb, testStore } from '../helpers/db';

const MB = 1024 * 1024;

async function withData() {
  const ctx = testStore();
  const calendar = await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  await ctx.store.createEvent({
    calendarId: calendar.id,
    title: 'Meeting',
    allDay: false,
    start: '2026-10-13T09:00',
    end: '2026-10-13T10:00',
    tzid: 'Asia/Riyadh',
  });
  return { ...ctx, calendar, snapshots: testSnapshotDb() };
}

describe('snapshotBudgetBytes', () => {
  it('is 10% of the quota, clamped to 20–150 MB', () => {
    expect(snapshotBudgetBytes(1000 * MB)).toBe(100 * MB);
    expect(snapshotBudgetBytes(50 * MB)).toBe(20 * MB);
    expect(snapshotBudgetBytes(10_000 * MB)).toBe(150 * MB);
  });

  it('falls back to the minimum when the quota is unknown', () => {
    expect(snapshotBudgetBytes(undefined)).toBe(20 * MB);
    expect(snapshotBudgetBytes(Number.NaN)).toBe(20 * MB);
  });
});

describe('takeSnapshot', () => {
  it('stores a parseable copy of the current data', async () => {
    const { db, snapshots, clock } = await withData();
    const info = await takeSnapshot(db, snapshots, 'manual', clock.now);

    expect(info).toMatchObject({ reason: 'manual', createdAt: T0, stamp: T0 });
    expect(info.bytes).toBeGreaterThan(0);

    const parsed = await getSnapshotEnvelope(snapshots, info.id);
    expect(parsed?.ok).toBe(true);
    expect(parsed?.ok && parsed.value).toEqual(await exportEnvelope(db, T0));
  });

  it('lists newest first without the payload', async () => {
    const { db, snapshots, clock } = await withData();
    const first = await takeSnapshot(db, snapshots, 'manual', clock.now);
    clock.advance(1000);
    const second = await takeSnapshot(db, snapshots, 'manual', clock.now);

    const list = await listSnapshots(snapshots);
    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(Object.keys(list[0] ?? {})).not.toContain('json');
  });

  it('returns undefined for an unknown snapshot', async () => {
    const { snapshots } = await withData();
    expect(await getSnapshotEnvelope(snapshots, 999)).toBeUndefined();
  });

  it('reports a damaged snapshot as an error instead of throwing', async () => {
    const { snapshots } = await withData();
    const id = await snapshots.snapshots.add({
      createdAt: 1,
      reason: 'manual',
      stamp: 1,
      bytes: 3,
      json: '{x',
    });
    const parsed = await getSnapshotEnvelope(snapshots, id);
    expect(parsed).toEqual({ ok: false, error: { code: 'not-json' } });
  });
});

describe('pruneSnapshots', () => {
  it(`keeps only the newest ${KEEP_SNAPSHOTS}`, async () => {
    const { db, snapshots, clock } = await withData();
    for (let i = 0; i < KEEP_SNAPSHOTS + 3; i += 1) {
      clock.advance(1000);
      await takeSnapshot(db, snapshots, 'manual', clock.now);
    }
    const list = await listSnapshots(snapshots);
    expect(list).toHaveLength(KEEP_SNAPSHOTS);
    expect(list[0]?.createdAt).toBe(T0 + (KEEP_SNAPSHOTS + 3) * 1000);
  });

  it('drops the oldest while over the byte budget, but never the last one', async () => {
    const { db, snapshots, clock } = await withData();
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1000);
      await takeSnapshot(db, snapshots, 'manual', clock.now, { budgetBytes: 10 * MB });
    }
    expect(await listSnapshots(snapshots)).toHaveLength(3);

    const removed = await pruneSnapshots(snapshots, { budgetBytes: 1 });
    expect(removed).toBe(2);
    const left = await listSnapshots(snapshots);
    expect(left).toHaveLength(1);
    expect(left[0]?.createdAt).toBe(T0 + 3000); // the newest survived
  });

  it('does nothing when there is nothing to prune', async () => {
    expect(await pruneSnapshots(testSnapshotDb())).toBe(0);
  });
});

describe('maybeTakeDailySnapshot', () => {
  it('skips an empty database', async () => {
    const { db, snapshots, clock } = testStoreOnly();
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toBeUndefined();
  });

  it('takes the first one, then skips while nothing changed', async () => {
    const { db, snapshots, clock } = await withData();
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toMatchObject({
      reason: 'daily',
    });
    clock.advance(3 * DAY);
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toBeUndefined();
    expect(await listSnapshots(snapshots)).toHaveLength(1);
  });

  it('skips a change made less than a day after the last daily snapshot', async () => {
    const { db, snapshots, store, clock, calendar } = await withData();
    await maybeTakeDailySnapshot(db, snapshots, clock.now);
    clock.advance(DAY / 2);
    await store.updateCalendar(calendar.id, { name: 'Renamed' });
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toBeUndefined();
  });

  it('takes another once something changed AND a day has passed', async () => {
    const { db, snapshots, store, clock, calendar } = await withData();
    await maybeTakeDailySnapshot(db, snapshots, clock.now);
    clock.advance(DAY + 1);
    await store.updateCalendar(calendar.id, { name: 'Renamed' });
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toMatchObject({
      reason: 'daily',
    });
    expect(await listSnapshots(snapshots)).toHaveLength(2);
  });

  it('ignores manual snapshots when deciding', async () => {
    const { db, snapshots, clock } = await withData();
    await takeSnapshot(db, snapshots, 'manual', clock.now);
    expect(await maybeTakeDailySnapshot(db, snapshots, clock.now)).toMatchObject({
      reason: 'daily',
    });
  });
});

describe('importWithSafetySnapshot', () => {
  it('snapshots the data as it was BEFORE the import changed anything', async () => {
    const { db, snapshots, clock } = await withData();
    const before = await exportEnvelope(db, clock.now());
    const incoming = buildEnvelope(
      [makeCalendar({ id: 'imported-cal', name: 'Imported' })],
      [makeEvent({ id: 'imported-ev', calendarId: 'imported-cal' })],
      clock.now(),
    );
    // Round-trip through JSON like a real file.
    const file = JSON.parse(serializeEnvelope(incoming)) as typeof incoming;

    const result = await importWithSafetySnapshot(db, snapshots, file, clock.now);

    expect(result.calendars.added).toHaveLength(1);
    expect(await db.calendars.get('imported-cal')).toBeDefined();

    const [safety] = await listSnapshots(snapshots);
    expect(safety?.reason).toBe('before-import');
    const restored = safety ? await getSnapshotEnvelope(snapshots, safety.id) : undefined;
    expect(restored?.ok && restored.value.calendars.map((c) => c.id)).toEqual(
      before.calendars.map((c) => c.id),
    );
    expect(restored?.ok && restored.value.calendars.some((c) => c.id === 'imported-cal')).toBe(
      false,
    );
  });
});

function testStoreOnly() {
  const ctx = testStore();
  return { ...ctx, snapshots: testSnapshotDb() };
}
