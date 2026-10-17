import { useCallback, useEffect, useState } from 'react';
import { watch } from '@/data';
import type { CalEvent, Calendar } from '@/core/model';
import { useData } from './DataContext';

export interface CalendarData {
  readonly status: 'loading' | 'ready' | 'error';
  readonly calendars: readonly Calendar[];
  /** Raw stored events: validate before use (the month model does). */
  readonly events: readonly CalEvent[];
  readonly toggleCalendar: (id: string, visible: boolean) => Promise<boolean>;
}

const EMPTY: readonly never[] = [];

/** Live calendars and events: re-reads when anything changes, also from another tab. */
export function useCalendarData(): CalendarData {
  const data = useData();
  const [calendars, setCalendars] = useState<readonly Calendar[] | undefined>(undefined);
  const [events, setEvents] = useState<readonly CalEvent[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const store = data.status === 'ready' ? data.store : undefined;
  useEffect(() => {
    if (!store) return;
    setFailed(false);
    const stopCalendars = watch(
      () => store.listCalendars(),
      setCalendars,
      () => setFailed(true),
    );
    const stopEvents = watch(
      () => store.listEvents(),
      setEvents,
      () => setFailed(true),
    );
    return () => {
      stopCalendars();
      stopEvents();
    };
  }, [store]);

  const toggleCalendar = useCallback(
    async (id: string, visible: boolean): Promise<boolean> => {
      if (!store) return false;
      try {
        const result = await store.updateCalendar(id, { visible });
        return result.status === 'ok';
      } catch {
        return false;
      }
    },
    [store],
  );

  const status =
    data.status === 'error' || failed
      ? 'error'
      : data.status === 'ready' && calendars && events
        ? 'ready'
        : 'loading';
  return { status, calendars: calendars ?? EMPTY, events: events ?? EMPTY, toggleCalendar };
}
