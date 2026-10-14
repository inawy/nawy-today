import {
  nextUpdatedAt,
  parseCalendar,
  parseEvent,
  tombstoneCalendar,
  tombstoneEvent,
  type CalEvent,
  type Calendar,
  type Result,
} from '@/core/model';
import { nowMs } from '@/core/time';
import type { NawyDb } from './schema';

// The only write path the UI will use. Every write is validated by core/model before it reaches
// the database, and deletion always produces a tombstone (D-008).

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface StoreDeps {
  /** Epoch-ms clock. Injectable so tests never depend on real time. */
  now?: () => number;
  newId?: () => string;
}

export type NewCalendar = Pick<Calendar, 'name' | 'color'> & { visible?: boolean };
export type CalendarPatch = Partial<Pick<Calendar, 'name' | 'color' | 'visible'>>;
export type NewEvent = Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
/** A field set to `undefined` is cleared. */
export type EventPatch = Partial<NewEvent>;

export interface UpdateOptions {
  /**
   * The `updatedAt` the caller last saw. If the stored record has moved on (another tab wrote
   * to it), the update is refused with `conflict` instead of silently overwriting (D-008).
   */
  expectedUpdatedAt?: number;
}

export type UpdateResult<T> =
  { status: 'ok'; value: T } | { status: 'not-found' } | { status: 'conflict'; current: T };

function valid<T>(result: Result<T>): T {
  if (!result.ok) throw new ValidationError(result.error);
  return result.value;
}

const byStartThenId = (a: CalEvent, b: CalEvent): number =>
  a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const byCreatedThenId = (a: Calendar, b: Calendar): number =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createStore(db: NawyDb, deps: StoreDeps = {}) {
  const now = deps.now ?? nowMs;
  const newId = deps.newId ?? (() => crypto.randomUUID());

  async function requireLiveCalendar(calendarId: string): Promise<void> {
    const calendar = await db.calendars.get(calendarId);
    if (!calendar || calendar.deletedAt !== undefined) {
      throw new ValidationError('calendar not found');
    }
  }

  return {
    async createCalendar(input: NewCalendar): Promise<Calendar> {
      const t = now();
      const calendar = valid(
        parseCalendar({
          id: newId(),
          name: input.name,
          color: input.color,
          visible: input.visible ?? true,
          createdAt: t,
          updatedAt: t,
        }),
      );
      await db.calendars.add(calendar);
      return calendar;
    },

    async updateCalendar(
      id: string,
      patch: CalendarPatch,
      options: UpdateOptions = {},
    ): Promise<UpdateResult<Calendar>> {
      return db.transaction('rw', db.calendars, async (): Promise<UpdateResult<Calendar>> => {
        const cur = await db.calendars.get(id);
        if (!cur || cur.deletedAt !== undefined) return { status: 'not-found' };
        if (
          options.expectedUpdatedAt !== undefined &&
          options.expectedUpdatedAt !== cur.updatedAt
        ) {
          return { status: 'conflict', current: cur };
        }
        const next = valid(
          parseCalendar({ ...cur, ...patch, updatedAt: nextUpdatedAt(cur.updatedAt, now()) }),
        );
        await db.calendars.put(next);
        return { status: 'ok', value: next };
      });
    },

    /** Deletes a calendar and, with it, all of its events. Returns false if it was not live. */
    async deleteCalendar(id: string): Promise<boolean> {
      return db.transaction('rw', db.calendars, db.events, async () => {
        const cur = await db.calendars.get(id);
        if (!cur || cur.deletedAt !== undefined) return false;
        const t = now();
        const events = await db.events
          .where('calendarId')
          .equals(id)
          .filter((e) => e.deletedAt === undefined)
          .toArray();
        await db.events.bulkPut(events.map((e) => tombstoneEvent(e, t)));
        await db.calendars.put(tombstoneCalendar(cur, t));
        return true;
      });
    },

    async getCalendar(id: string): Promise<Calendar | undefined> {
      const calendar = await db.calendars.get(id);
      return calendar && calendar.deletedAt === undefined ? calendar : undefined;
    },

    async listCalendars(): Promise<Calendar[]> {
      const all = await db.calendars.filter((c) => c.deletedAt === undefined).toArray();
      return all.sort(byCreatedThenId);
    },

    async createEvent(input: NewEvent): Promise<CalEvent> {
      return db.transaction('rw', db.calendars, db.events, async () => {
        await requireLiveCalendar(input.calendarId);
        const t = now();
        const event = valid(parseEvent({ ...input, id: newId(), createdAt: t, updatedAt: t }));
        await db.events.add(event);
        return event;
      });
    },

    async updateEvent(
      id: string,
      patch: EventPatch,
      options: UpdateOptions = {},
    ): Promise<UpdateResult<CalEvent>> {
      return db.transaction(
        'rw',
        db.calendars,
        db.events,
        async (): Promise<UpdateResult<CalEvent>> => {
          const cur = await db.events.get(id);
          if (!cur || cur.deletedAt !== undefined) return { status: 'not-found' };
          if (
            options.expectedUpdatedAt !== undefined &&
            options.expectedUpdatedAt !== cur.updatedAt
          ) {
            return { status: 'conflict', current: cur };
          }
          if (patch.calendarId !== undefined && patch.calendarId !== cur.calendarId) {
            await requireLiveCalendar(patch.calendarId);
          }
          const next = valid(
            parseEvent({
              ...cur,
              ...patch,
              id: cur.id,
              createdAt: cur.createdAt,
              updatedAt: nextUpdatedAt(cur.updatedAt, now()),
            }),
          );
          await db.events.put(next);
          return { status: 'ok', value: next };
        },
      );
    },

    /**
     * Deletes an event, and the overrides that belong to it if it is a repeating series.
     * Returns false if the event was not live.
     */
    async deleteEvent(id: string): Promise<boolean> {
      return db.transaction('rw', db.events, async () => {
        const cur = await db.events.get(id);
        if (!cur || cur.deletedAt !== undefined) return false;
        const t = now();
        const overrides = await db.events
          .where('seriesId')
          .equals(id)
          .filter((e) => e.deletedAt === undefined)
          .toArray();
        await db.events.bulkPut([cur, ...overrides].map((e) => tombstoneEvent(e, t)));
        return true;
      });
    },

    /** A live event in a live calendar, or undefined. */
    async getEvent(id: string): Promise<CalEvent | undefined> {
      return db.transaction('r', db.calendars, db.events, async () => {
        const event = await db.events.get(id);
        if (!event || event.deletedAt !== undefined) return undefined;
        const calendar = await db.calendars.get(event.calendarId);
        return calendar && calendar.deletedAt === undefined ? event : undefined;
      });
    },

    /** All live events in live calendars, all-day first within a day. */
    async listEvents(): Promise<CalEvent[]> {
      return db.transaction('r', db.calendars, db.events, async () => {
        const calendars = await db.calendars.toArray();
        const live = new Set(calendars.filter((c) => c.deletedAt === undefined).map((c) => c.id));
        const events = await db.events
          .filter((e) => e.deletedAt === undefined && live.has(e.calendarId))
          .toArray();
        return events.sort(byStartThenId);
      });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
