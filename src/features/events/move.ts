import { addDays, isoOfEpochMinute, toEpochMinute } from '@/core/time';
import type { PlainDate } from '@/core/time';
import type { Draft } from './draft';

/**
 * The same event, moved by whole days and/or minutes of wall-clock time (what dragging does).
 * Returns `undefined` when the draft's dates cannot be read, so a bad record is never "moved".
 * All-day events move by days only; timed events keep their length and may cross midnight.
 */
/** The shortest a resized event can get: one drag step. */
export const MIN_RESIZE_MINUTES = 15;

/**
 * The same event with its END moved by `minutes` (what dragging the bottom edge does). The start
 * stays; the end never goes closer than a step to it. Only timed events resize; `undefined` when
 * the draft is all-day or its times cannot be read.
 */
export function resizeDraft(draft: Draft, minutes: number): Draft | undefined {
  if (draft.allDay) return undefined;
  const start = toEpochMinute(`${draft.startDate}T${draft.startTime}`);
  const end = toEpochMinute(`${draft.endDate}T${draft.endTime}`);
  if (start === undefined || end === undefined) return undefined;
  const nextEnd = isoOfEpochMinute(Math.max(start + MIN_RESIZE_MINUTES, end + minutes), false);
  return { ...draft, endDate: nextEnd.slice(0, 10), endTime: nextEnd.slice(11, 16) };
}

export function moveDraft(draft: Draft, days: number, minutes: number): Draft | undefined {
  if (draft.allDay) {
    if (days === 0) return draft;
    return {
      ...draft,
      startDate: addDays(draft.startDate as PlainDate, days),
      endDate: addDays(draft.endDate as PlainDate, days),
    };
  }
  const start = toEpochMinute(`${draft.startDate}T${draft.startTime}`);
  const end = toEpochMinute(`${draft.endDate}T${draft.endTime}`);
  if (start === undefined || end === undefined) return undefined;
  const shift = days * 1440 + minutes;
  const nextStart = isoOfEpochMinute(start + shift, false);
  const nextEnd = isoOfEpochMinute(end + shift, false);
  return {
    ...draft,
    startDate: nextStart.slice(0, 10),
    startTime: nextStart.slice(11, 16),
    endDate: nextEnd.slice(0, 10),
    endTime: nextEnd.slice(11, 16),
  };
}
