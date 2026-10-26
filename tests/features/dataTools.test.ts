// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { serializeEnvelope } from '@/core/model';
import { exportEnvelope } from '@/data';
import { createDataTools, summarize } from '@/features/backup';

import { testDb, testSnapshotDb, testStore } from '../helpers/db';

const timed = (calendarId: string, over = {}) => ({
  calendarId,
  title: 'Meeting',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T10:00',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function setup() {
  const ctx = testStore();
  const snapshotDb = testSnapshotDb();
  const backups: number[] = [];
  const tools = createDataTools({
    db: ctx.db,
    snapshotDb,
    timeZone: 'Asia/Riyadh',
    now: ctx.clock.now,
    onBackup: (at) => backups.push(at),
  });
  const cal = await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  const keep = await ctx.store.createEvent(timed(cal.id, { title: 'Keep' }));
  const lost = await ctx.store.createEvent(timed(cal.id, { title: 'Lost' }));
  return { ...ctx, snapshotDb, tools, backups, cal, keep, lost };
}

const inspected = (o: Awaited<ReturnType<ReturnType<typeof createDataTools>['inspectFile']>>) => {
  if (!o.ok) throw new Error(`expected ok, got ${o.failure}`);
  return o.inspection;
};

describe('exportFile', () => {
  it('produces a dated file, parseable again, and tells the reminder', async () => {
    const { tools, backups, clock } = await setup();
    const file = await tools.exportFile();
    expect(file.name).toBe('nawy-today-2026-10-13.json');
    expect(backups).toEqual([clock.now()]);
    const again = await tools.inspectFile(file.name, file.text);
    expect(again.ok).toBe(true);
  });
});

describe('inspectFile refuses, with a named reason and without touching anything', () => {
  it.each([
    ['not json', '{oops', 'not-json'],
    ['an array', '[]', 'not-an-envelope'],
    ['another app', JSON.stringify({ app: 'nawy-notes', schemaVersion: 1 }), 'wrong-app'],
    [
      'a newer version',
      JSON.stringify({
        app: 'nawy-today',
        schemaVersion: 999,
        exportedAt: 1,
        calendars: [],
        events: [],
      }),
      'newer-version',
    ],
  ])('%s', async (_name, text, failure) => {
    const { tools, db } = await setup();
    const before = await exportEnvelope(db, 1);
    expect(await tools.inspectFile('x.json', text)).toEqual({ ok: false, failure });
    expect(await exportEnvelope(db, 1)).toEqual(before);
  });

  it('a file over the size limit', async () => {
    const { tools } = await setup();
    expect(await tools.inspectFile('x.json', '{}', 60 * 1024 * 1024)).toEqual({
      ok: false,
      failure: 'too-big',
    });
  });
});

describe('the full round trip (PRODUCT_SPEC 5)', () => {
  it('export, then replace into an empty device, gives back identical live data', async () => {
    const { tools, store } = await setup();
    const file = await tools.exportFile();

    const target = testDb();
    const targetTools = createDataTools({
      db: target,
      snapshotDb: testSnapshotDb(),
      timeZone: 'Asia/Riyadh',
    });
    const inspection = inspected(await targetTools.inspectFile(file.name, file.text));
    await targetTools.apply(inspection, 'replace');

    const live = async (db: typeof target) =>
      (await exportEnvelope(db, 1)).events
        .filter((e) => e.deletedAt === undefined)
        .map((e) => ({ ...e, updatedAt: 0 }));
    expect(await live(target)).toEqual(
      (await store.listEvents()).map((e) => ({ ...e, updatedAt: 0 })),
    );
  });
});

describe('the round trip with everything a real calendar holds', () => {
  it('keeps repeats, overrides, hidden calendars, Arabic text and deletions', async () => {
    const { tools, store, cal, db } = await setup();
    const hidden = await store.createCalendar({ name: 'عمل 🧳', color: '#12ab34', visible: false });
    const series = await store.createEvent(
      timed(cal.id, {
        title: 'اجتماع الأسبوع',
        notes: 'سطر أول\nسطر ثانٍ، مع فاصلة؛ وعلامة \\ 🙂',
        location: 'الرياض',
        rrule: 'FREQ=WEEKLY;COUNT=6',
        exdates: ['2026-10-20T09:00'],
        color: '#2e7d32',
      }),
    );
    await store.createEvent(
      timed(cal.id, {
        title: 'نقل هذا اليوم',
        seriesId: series.id,
        originalStart: '2026-10-27T09:00',
        start: '2026-10-27T14:00',
        end: '2026-10-27T15:30',
        tzid: 'Asia/Riyadh',
      }),
    );
    await store.createEvent({
      calendarId: hidden.id,
      title: 'إجازة',
      allDay: true,
      start: '2026-11-01',
      end: '2026-11-04',
    });
    const gone = await store.createEvent(timed(cal.id, { title: 'محذوف' }));
    await store.deleteEvent(gone.id);

    const file = await tools.exportFile();
    const target = testDb();
    const targetTools = createDataTools({
      db: target,
      snapshotDb: testSnapshotDb(),
      timeZone: 'Asia/Riyadh',
    });
    const inspection = inspected(await targetTools.inspectFile(file.name, file.text));
    await targetTools.apply(inspection, 'replace');

    const all = async (db: typeof target) => {
      const env = await exportEnvelope(db, 1);
      const byId = <T extends { id: string }>(rows: readonly T[]) =>
        [...rows].sort((a, b) => a.id.localeCompare(b.id));
      return { calendars: byId(env.calendars), events: byId(env.events) };
    };
    const restored = await all(target);
    expect(restored).toEqual(await all(db));
    // The comparison above would pass vacuously on an empty copy; pin what must be inside.
    expect(restored.calendars).toHaveLength(2);
    expect(restored.events).toHaveLength(6);
    expect(restored.events.filter((e) => e.deletedAt !== undefined)).toHaveLength(1);
    expect(restored.events.find((e) => e.rrule)?.exdates).toEqual(['2026-10-20T09:00']);
  });
});

describe('apply', () => {
  it('merge keeps newer local deletions; replace brings them back; both take a safety snapshot', async () => {
    const { tools, store, clock, lost } = await setup();
    const file = await tools.exportFile();
    clock.advance(60_000);
    await store.deleteEvent(lost.id);
    clock.advance(60_000);

    const inspection = inspected(await tools.inspectFile(file.name, file.text));
    expect(summarize(inspection, 'merge').events.added).toBe(0);
    expect(summarize(inspection, 'replace').events.added).toBe(1);

    await tools.apply(inspection, 'merge');
    expect((await store.listEvents()).map((e) => e.title)).toEqual(['Keep']);

    clock.advance(60_000);
    const applied = await tools.apply(inspection, 'replace');
    expect(applied.events.added).toBe(1);
    expect((await store.listEvents()).map((e) => e.title).sort()).toEqual(['Keep', 'Lost']);

    const reasons = (await tools.snapshots()).map((s) => s.reason);
    expect(reasons).toEqual(['before-import', 'before-import']);
  });

  it('the numbers promised by the preview are the numbers applied', async () => {
    const { tools, store, clock, cal } = await setup();
    const file = await tools.exportFile();
    clock.advance(1000);
    await store.createEvent(timed(cal.id, { title: 'After' }));
    clock.advance(1000);
    const inspection = inspected(await tools.inspectFile(file.name, file.text));
    const promised = summarize(inspection, 'replace');
    const applied = await tools.apply(inspection, 'replace');
    expect(applied.events).toEqual(promised.events);
    expect(applied.calendars).toEqual(promised.calendars);
  });
});

describe('snapshots', () => {
  it('manual snapshot, listed, downloadable, and restorable as a replace', async () => {
    const { tools, store, clock, lost } = await setup();
    const info = await tools.saveSnapshot();
    expect((await tools.snapshots()).map((s) => s.reason)).toEqual(['manual']);

    const file = await tools.snapshotFile(info.id);
    expect(file?.name).toBe('nawy-today-snapshot-2026-10-13.json');
    expect(JSON.parse(file?.text ?? '{}').app).toBe('nawy-today');

    clock.advance(1000);
    await store.deleteEvent(lost.id);
    clock.advance(1000);
    const inspection = inspected(await tools.inspectSnapshot(info.id));
    expect(inspection.source).toMatchObject({ kind: 'snapshot', id: info.id });
    await tools.apply(inspection, 'replace');
    expect((await store.listEvents()).map((e) => e.title).sort()).toEqual(['Keep', 'Lost']);
    expect((await tools.snapshots()).map((s) => s.reason)).toContain('before-restore');
  });

  it('an unknown snapshot id is a named failure, not an exception', async () => {
    const { tools } = await setup();
    expect(await tools.inspectSnapshot(12345)).toEqual({ ok: false, failure: 'snapshot-missing' });
    expect(await tools.snapshotFile(12345)).toBeUndefined();
  });

  it('a damaged snapshot is refused with the parse failure', async () => {
    const { tools, snapshotDb } = await setup();
    const id = await snapshotDb.snapshots.add({
      createdAt: 1,
      reason: 'manual',
      stamp: 1,
      bytes: 3,
      json: '{oops',
    });
    expect(await tools.inspectSnapshot(id)).toEqual({ ok: false, failure: 'not-json' });
  });
});

// Keeps `serializeEnvelope` honest as the format the tools write.
describe('format', () => {
  it('export text equals the pretty envelope serialisation', async () => {
    const { tools, db, clock } = await setup();
    const file = await tools.exportFile();
    expect(file.text).toBe(serializeEnvelope(await exportEnvelope(db, clock.now()), true));
  });
});
