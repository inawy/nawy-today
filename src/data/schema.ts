import Dexie, { type EntityTable } from 'dexie';
import type { CalEvent, Calendar } from '@/core/model';

// The database name is private to this app, so it can share a domain with Nawy Notes (D-009).
export const DEFAULT_DB_NAME = 'nawy-today';

export type NawyDb = Dexie & {
  calendars: EntityTable<Calendar, 'id'>;
  events: EntityTable<CalEvent, 'id'>;
};

/**
 * Opens (lazily) the main database. A schema change means a NEW `db.version(n)` block below —
 * never an edit to an existing one — plus a migration test (D-008).
 */
export function createDb(name: string = DEFAULT_DB_NAME): NawyDb {
  const db = new Dexie(name) as NawyDb;
  db.version(1).stores({
    calendars: 'id, updatedAt',
    events: 'id, calendarId, start, end, seriesId, updatedAt',
  });
  return db;
}
