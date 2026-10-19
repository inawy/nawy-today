import Dexie from 'dexie';
import { nowMs } from '@/core/time';
import { DEFAULT_DB_NAME, type NawyDb } from './schema';

// The ONLY place in the app that removes records from the main database (enforced by lint,
// D-008): tombstones older than the retention period. Everything else deletes by writing a
// tombstone.

export const TOMBSTONE_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeResult {
  events: number;
  calendars: number;
}

/**
 * Removes tombstones older than the retention period. A calendar tombstone stays for as long as
 * any event (even a tombstone) still points at it, so an export can never contain an event
 * whose calendar is missing.
 */
export function purgeExpiredTombstones(
  db: NawyDb,
  now: () => number = nowMs,
): Promise<PurgeResult> {
  const cutoff = now() - TOMBSTONE_RETENTION_DAYS * DAY_MS;
  return db.transaction('rw', db.calendars, db.events, async () => {
    const eventKeys = await db.events
      .filter((e) => e.deletedAt !== undefined && e.deletedAt < cutoff)
      .primaryKeys();
    await db.events.bulkDelete(eventKeys);

    const expired = await db.calendars
      .filter((c) => c.deletedAt !== undefined && c.deletedAt < cutoff)
      .toArray();
    const calendarKeys: string[] = [];
    for (const calendar of expired) {
      const remaining = await db.events.where('calendarId').equals(calendar.id).count();
      if (remaining === 0) calendarKeys.push(calendar.id);
    }
    await db.calendars.bulkDelete(calendarKeys);

    return { events: eventKeys.length, calendars: calendarKeys.length };
  });
}

/**
 * Deletes the whole main database file (recovery only, D-028). Used when it cannot be opened and
 * the person explicitly chose to start clean; the snapshots live in another database and stay.
 * Resolves false when the browser refuses or another tab holds it open.
 */
export async function resetDatabase(name: string = DEFAULT_DB_NAME): Promise<boolean> {
  try {
    await Dexie.delete(name);
    return true;
  } catch {
    return false;
  }
}
