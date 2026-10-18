import type { CalEvent } from '@/core/model';
import type { Occurrence } from '@/core/recurrence';
import type { Target } from './plan';

/**
 * What the user clicked → what the planner needs: the plain event or the series master, its live
 * overrides, and the occurrence's key in the master's schedule. An override whose series is gone
 * is treated as a plain event, so it can still be edited and deleted.
 */
export function resolveTarget(events: readonly CalEvent[], occurrence: Occurrence): Target {
  const clicked = occurrence.event;
  const live = events.filter((e) => e.deletedAt === undefined);

  if (clicked.seriesId !== undefined) {
    const master = live.find((e) => e.id === clicked.seriesId && e.rrule !== undefined);
    if (!master) return { master: clicked, overrides: [] };
    const overrides = live.filter((e) => e.seriesId === master.id);
    return {
      master,
      overrides,
      override: clicked,
      ...(occurrence.originalStart !== undefined && { originalStart: occurrence.originalStart }),
    };
  }

  if (clicked.rrule !== undefined && occurrence.originalStart !== undefined) {
    return {
      master: clicked,
      overrides: live.filter((e) => e.seriesId === clicked.id),
      originalStart: occurrence.originalStart,
    };
  }
  return { master: clicked, overrides: [] };
}
