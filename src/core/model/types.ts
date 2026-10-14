import type { PlainDate, PlainDateTime, TimeZoneId } from '@/core/time';

/** Opaque record id (a UUID for everything this app creates). */
export type Id = string;

export interface Calendar {
  id: Id;
  name: string;
  /** A palette token id (e.g. `blue`) or a `#rrggbb` value. */
  color: string;
  visible: boolean;
  createdAt: number;
  /** Epoch ms. Strictly increases on every write (see nextUpdatedAt) — it is the merge clock. */
  updatedAt: number;
  /** Present on tombstones only (D-008). Equals `updatedAt` for records this app wrote. */
  deletedAt?: number;
}

export interface CalEvent {
  id: Id;
  calendarId: Id;
  title: string;
  notes?: string;
  location?: string;
  allDay: boolean;
  /** `YYYY-MM-DD` when `allDay`, otherwise `YYYY-MM-DDTHH:mm` wall-clock time (D-005). */
  start: PlainDate | PlainDateTime;
  /** Same form as `start`. Exclusive when `allDay`. */
  end: PlainDate | PlainDateTime;
  /** IANA zone. Required for timed events, forbidden for all-day events. */
  tzid?: TimeZoneId;
  /** RFC 5545 RRULE text (validated by the recurrence engine in Phase 3). */
  rrule?: string;
  exdates?: string[];
  /** Set on an override of one occurrence of a repeating event (with `originalStart`). */
  seriesId?: Id;
  originalStart?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** What the merge logic needs to know about any record. */
export interface Versioned {
  id: Id;
  updatedAt: number;
  deletedAt?: number;
}

export function isDeleted(record: { deletedAt?: number }): boolean {
  return record.deletedAt !== undefined;
}
