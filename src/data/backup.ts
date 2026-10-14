import {
  buildEnvelope,
  planMerge,
  recordsToWrite,
  tombstoneEvent,
  type CalEvent,
  type Calendar,
  type Envelope,
  type MergePlan,
} from '@/core/model';
import { nowMs } from '@/core/time';
import type { NawyDb } from './schema';

// Export and import (D-008). Parsing and merge rules live in core/model; this file only moves
// records in and out of the database, inside one transaction.

export interface ImportPlan {
  calendars: MergePlan<Calendar>;
  events: MergePlan<CalEvent>;
}

export interface ImportResult extends ImportPlan {
  /** Live local events that lost their calendar or series through the import and were deleted. */
  orphanedEvents: number;
}

/** Everything, tombstones included, so a restore can never resurrect something deleted. */
export function exportEnvelope(db: NawyDb, exportedAt: number = nowMs()): Promise<Envelope> {
  return db.transaction('r', db.calendars, db.events, async () => {
    const [calendars, events] = await Promise.all([db.calendars.toArray(), db.events.toArray()]);
    return buildEnvelope(calendars, events, exportedAt);
  });
}

/** The one thing loadLocal needs from a table, so it works for any table keyed by string id. */
interface BulkReadable<T> {
  bulkGet(keys: string[]): PromiseLike<(T | undefined)[]>;
}

async function loadLocal<T extends { id: string }>(
  table: BulkReadable<T>,
  ids: readonly string[],
): Promise<Map<string, T>> {
  const rows = await table.bulkGet([...ids]);
  const local = new Map<string, T>();
  for (const row of rows) {
    if (row) local.set(row.id, row);
  }
  return local;
}

async function computePlan(db: NawyDb, envelope: Envelope): Promise<ImportPlan> {
  const [calendars, events] = await Promise.all([
    loadLocal(
      db.calendars,
      envelope.calendars.map((c) => c.id),
    ),
    loadLocal(
      db.events,
      envelope.events.map((e) => e.id),
    ),
  ]);
  return {
    calendars: planMerge(calendars, envelope.calendars),
    events: planMerge(events, envelope.events),
  };
}

/** What an import would do, without writing anything (for the preview screen). */
export function previewImport(db: NawyDb, envelope: Envelope): Promise<ImportPlan> {
  return db.transaction('r', db.calendars, db.events, () => computePlan(db, envelope));
}

/**
 * Local events can be left pointing at a calendar (or series) that the import deleted.
 * Delete them too, so nothing live ever hangs under a deleted parent.
 */
async function tombstoneOrphans(db: NawyDb, now: () => number): Promise<number> {
  const calendars = await db.calendars.toArray();
  const liveCalendars = new Set(
    calendars.filter((c) => c.deletedAt === undefined).map((c) => c.id),
  );
  const live = await db.events.filter((e) => e.deletedAt === undefined).toArray();

  const inLiveCalendar = live.filter((e) => liveCalendars.has(e.calendarId));
  const liveSeries = new Set(
    inLiveCalendar.filter((e) => e.seriesId === undefined).map((e) => e.id),
  );
  const orphans = [
    ...live.filter((e) => !liveCalendars.has(e.calendarId)),
    ...inLiveCalendar.filter((e) => e.seriesId !== undefined && !liveSeries.has(e.seriesId)),
  ];

  const t = now();
  await db.events.bulkPut(orphans.map((e) => tombstoneEvent(e, t)));
  return orphans.length;
}

/** Merges an envelope into the database, atomically. */
export function applyImport(
  db: NawyDb,
  envelope: Envelope,
  now: () => number = nowMs,
): Promise<ImportResult> {
  return db.transaction('rw', db.calendars, db.events, async () => {
    const plan = await computePlan(db, envelope);
    await db.calendars.bulkPut(recordsToWrite(plan.calendars));
    await db.events.bulkPut(recordsToWrite(plan.events));
    const orphanedEvents = await tombstoneOrphans(db, now);
    return { ...plan, orphanedEvents };
  });
}
