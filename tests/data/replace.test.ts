// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyReplace, exportEnvelope, previewReplace, replaceWithSafetySnapshot } from '@/data';
import { listSnapshots } from '@/data';
import { testSnapshotDb, testStore } from '../helpers/db';

const timed = (calendarId: string, over = {}) => ({
  calendarId,
  title: 'Meeting',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T10:00',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function backedUp() {
  const ctx = testStore();
  const cal = await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  const keep = await ctx.store.createEvent(timed(cal.id, { title: 'Keep' }));
  const lost = await ctx.store.createEvent(timed(cal.id, { title: 'Lost' }));
  const file = await exportEnvelope(ctx.db, ctx.clock.now());
  ctx.clock.advance(60_000);
  return { ...ctx, cal, keep, lost, file };
}

describe('restoring a backup (replace)', () => {
  it('brings back an event deleted after the backup, which a merge would not', async () => {
    const { db, store, clock, lost, file } = await backedUp();
    await store.deleteEvent(lost.id);
    clock.advance(1000);
    await applyReplace(db, file, clock.now);
    const titles = (await store.listEvents()).map((e) => e.title).sort();
    expect(titles).toEqual(['Keep', 'Lost']);
  });

  it('removes events created after the backup and reverts later edits', async () => {
    const { db, store, clock, keep, cal, file } = await backedUp();
    await store.updateEvent(keep.id, { title: 'Edited' });
    await store.createEvent(timed(cal.id, { title: 'New after backup' }));
    clock.advance(1000);
    const res = await applyReplace(db, file, clock.now);
    expect(res.events.removed).toBe(1);
    const titles = (await store.listEvents()).map((e) => e.title).sort();
    expect(titles).toEqual(['Keep', 'Lost']);
  });

  it('the preview reports the same numbers the apply does, and writes nothing', async () => {
    const { db, store, clock, lost, file } = await backedUp();
    await store.deleteEvent(lost.id);
    const before = await exportEnvelope(db, 1);
    const preview = await previewReplace(db, file, clock.now);
    expect(await exportEnvelope(db, 1)).toEqual(before);
    const res = await applyReplace(db, file, clock.now);
    expect(preview.events.added).toBe(res.events.added);
    expect(preview.events.removed).toBe(res.events.removed);
    expect(preview.events.added).toBe(1);
  });

  it('into an empty device gives back the same live data (full round trip)', async () => {
    const { file, store: source } = await backedUp();
    const target = testStore();
    await applyReplace(target.db, file, target.clock.now);
    const a = (await source.listEvents()).map((e) => [e.id, e.title]).sort();
    const b = (await target.store.listEvents()).map((e) => [e.id, e.title]).sort();
    expect(b).toEqual(a);
    expect((await target.store.listCalendars()).map((c) => c.name)).toEqual(['Personal']);
  });

  it('a calendar the file lacks is deleted together with its events', async () => {
    const { db, store, clock, file } = await backedUp();
    const extra = await store.createCalendar({ name: 'Extra', color: 'red' });
    await store.createEvent(timed(extra.id, { title: 'In extra' }));
    clock.advance(1000);
    await applyReplace(db, file, clock.now);
    expect((await store.listCalendars()).map((c) => c.name)).toEqual(['Personal']);
    expect((await store.listEvents()).map((e) => e.title)).not.toContain('In extra');
  });

  it('with a safety snapshot first, so the restore itself can be undone', async () => {
    const { db, store, clock, lost, file } = await backedUp();
    const snapshotDb = testSnapshotDb();
    await store.deleteEvent(lost.id);
    clock.advance(1000);
    await replaceWithSafetySnapshot(db, snapshotDb, file, 'before-restore', clock.now);
    const snaps = await listSnapshots(snapshotDb);
    expect(snaps.map((s) => s.reason)).toEqual(['before-restore']);
    expect((await store.listEvents()).map((e) => e.title).sort()).toEqual(['Keep', 'Lost']);
  });
});
