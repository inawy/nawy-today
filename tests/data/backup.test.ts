// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  buildEnvelope,
  parseEnvelope,
  serializeEnvelope,
  tombstoneEvent,
  type CalEvent,
  type Envelope,
} from '@/core/model';
import { applyImport, exportEnvelope, previewImport } from '@/data';
import { DAY, T0, fakeClock, makeCalendar, makeEvent } from '../helpers/factories';
import { testDb, testStore } from '../helpers/db';

const timed = (calendarId: string, over = {}) => ({
  calendarId,
  title: 'Meeting',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T10:00',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function seeded() {
  const ctx = testStore();
  const personal = await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  const work = await ctx.store.createCalendar({ name: 'Work', color: 'red' });
  const a = await ctx.store.createEvent(timed(personal.id, { title: 'A' }));
  const b = await ctx.store.createEvent(timed(work.id, { title: 'B', notes: 'n' }));
  const gone = await ctx.store.createEvent(timed(work.id, { title: 'Gone' }));
  ctx.clock.advance(1000);
  await ctx.store.deleteEvent(gone.id);
  return { ...ctx, personal, work, a, b, gone };
}

describe('exportEnvelope', () => {
  it('exports calendars, events and tombstones in a deterministic, parseable file', async () => {
    const { db, gone } = await seeded();
    const envelope = await exportEnvelope(db, T0 + 42);

    expect(envelope.exportedAt).toBe(T0 + 42);
    expect(envelope.calendars).toHaveLength(2);
    expect(envelope.events).toHaveLength(3);
    expect(envelope.events.find((e) => e.id === gone.id)?.deletedAt).toBeDefined();

    const text = serializeEnvelope(envelope);
    expect(text).toBe(serializeEnvelope(await exportEnvelope(db, T0 + 42)));
    expect(parseEnvelope(text)).toEqual({ ok: true, value: envelope });
  });

  it('exports an empty database as a valid empty file', async () => {
    const envelope = await exportEnvelope(testDb(), 5);
    expect(envelope).toMatchObject({ calendars: [], events: [] });
    expect(parseEnvelope(serializeEnvelope(envelope)).ok).toBe(true);
  });
});

describe('export → import round trip', () => {
  it('restores everything into an empty database, identically', async () => {
    const source = await seeded();
    const envelope = await exportEnvelope(source.db, T0 + 1);
    const parsed = parseEnvelope(serializeEnvelope(envelope));
    if (!parsed.ok) throw new Error('export must parse');

    const target = testDb();
    const result = await applyImport(target, parsed.value);

    expect(result.calendars.added).toHaveLength(2);
    expect(result.events.added).toHaveLength(2);
    expect(result.events.tombstones).toHaveLength(1);
    expect(await exportEnvelope(target, T0 + 1)).toEqual(envelope);
  });

  it('importing the same file again changes nothing', async () => {
    const source = await seeded();
    const envelope = await exportEnvelope(source.db, T0 + 1);

    const first = await applyImport(source.db, envelope);
    const second = await applyImport(source.db, envelope);

    for (const result of [first, second]) {
      expect(result.calendars).toMatchObject({
        added: [],
        updated: [],
        deleted: [],
        tombstones: [],
      });
      expect(result.events).toMatchObject({ added: [], updated: [], deleted: [], tombstones: [] });
    }
    expect(await exportEnvelope(source.db, T0 + 1)).toEqual(envelope);
  });
});

describe('previewImport', () => {
  it('reports what would happen and writes nothing', async () => {
    const source = await seeded();
    const envelope = await exportEnvelope(source.db, T0 + 1);
    const target = testDb();

    const preview = await previewImport(target, envelope);

    expect(preview.calendars.added).toHaveLength(2);
    expect(preview.events.added).toHaveLength(2);
    expect(await target.calendars.count()).toBe(0);
    expect(await target.events.count()).toBe(0);
  });
});

describe('import merging', () => {
  it('keeps a newer local edit over an older imported one', async () => {
    const { store, db, clock, a } = await seeded();
    const older = await exportEnvelope(db, T0);
    clock.advance(DAY);
    await store.updateEvent(a.id, { title: 'Edited later' });

    const result = await applyImport(db, older);

    expect(result.events.older).toBeGreaterThanOrEqual(1);
    expect((await db.events.get(a.id))?.title).toBe('Edited later');
  });

  it('takes a newer imported edit over an older local one', async () => {
    const { db, a } = await seeded();
    const base = await exportEnvelope(db, T0);
    const newer: Envelope = {
      ...base,
      events: base.events.map((e) =>
        e.id === a.id ? { ...e, title: 'From the file', updatedAt: e.updatedAt + DAY } : e,
      ),
    };

    const result = await applyImport(db, newer);

    expect(result.events.updated.map((e) => e.id)).toEqual([a.id]);
    expect((await db.events.get(a.id))?.title).toBe('From the file');
  });

  it('an imported deletion removes a live local event', async () => {
    const { db, a } = await seeded();
    const live = await db.events.get(a.id);
    if (!live) throw new Error('seed event missing');
    const envelope = buildEnvelope(
      await db.calendars.toArray(),
      [tombstoneEvent(live, live.updatedAt + 1000)],
      T0,
    );

    const result = await applyImport(db, envelope);

    expect(result.events.deleted.map((e) => e.id)).toEqual([a.id]);
    expect((await db.events.get(a.id))?.deletedAt).toBeDefined();
  });

  it('an old file cannot resurrect something deleted since', async () => {
    const { store, db, clock, a } = await seeded();
    const before = await exportEnvelope(db, T0);
    clock.advance(DAY);
    await store.deleteEvent(a.id);

    await applyImport(db, before);

    expect((await db.events.get(a.id))?.deletedAt).toBeDefined();
    expect((await store.listEvents()).map((e) => e.id)).not.toContain(a.id);
  });

  it('an imported calendar deletion also deletes local events left under it', async () => {
    const { db, work, clock } = await seeded();
    const calendars = await db.calendars.toArray();
    const target = calendars.find((c) => c.id === work.id);
    if (!target) throw new Error('seed calendar missing');
    // The file knows the calendar was deleted but has none of its events.
    const envelope = buildEnvelope(
      [
        {
          ...target,
          name: '',
          visible: false,
          updatedAt: target.updatedAt + 1000,
          deletedAt: target.updatedAt + 1000,
        },
      ],
      [],
      T0,
    );
    clock.advance(DAY);

    const result = await applyImport(db, envelope, clock.now);

    expect(result.orphanedEvents).toBe(1); // 'B' was live under "Work"; 'Gone' was already deleted
    const live = await db.events.filter((e) => e.deletedAt === undefined).toArray();
    expect(live.map((e) => e.title)).toEqual(['A']);
  });

  it('deletes overrides whose series was deleted by the import', async () => {
    const clock = fakeClock();
    const db = testDb();
    const calendar = makeCalendar();
    const series = makeEvent({ id: 'series', rrule: 'FREQ=DAILY' });
    const override = makeEvent({
      id: 'override',
      seriesId: 'series',
      originalStart: '2026-10-14T09:00',
      start: '2026-10-14T11:00',
      end: '2026-10-14T12:00',
    });
    await applyImport(db, buildEnvelope([calendar], [series, override], T0), clock.now);

    const deletedSeries = tombstoneEvent(series, T0 + 1000);
    const result = await applyImport(db, buildEnvelope([calendar], [deletedSeries], T0), clock.now);

    expect(result.orphanedEvents).toBe(1);
    expect((await db.events.get('override'))?.deletedAt).toBeDefined();
  });

  it('is atomic: a failure while writing events also rolls back the calendars', async () => {
    const { db } = await seeded();
    const before = await exportEnvelope(db, T0);
    // A function cannot be stored in IndexedDB, so writing this event fails — after the
    // calendar write in the same import has already been issued.
    const unstorable = {
      ...makeEvent({ id: 'new-one', calendarId: 'cal-new' }),
      poison: () => 1,
    } as unknown as CalEvent;
    const envelope = buildEnvelope(
      [makeCalendar({ id: 'cal-new', name: 'New' })],
      [unstorable],
      T0,
    );

    await expect(applyImport(db, envelope)).rejects.toThrow();

    expect(await db.calendars.get('cal-new')).toBeUndefined();
    expect(await exportEnvelope(db, T0)).toEqual(before);
  });
});
