import type { AgendaItem, AgendaModel } from './model';

/** The event to get ready for: the first timed one still ahead, on today's list only. */
export function nextItemKey(model: AgendaModel): string | undefined {
  if (model.nowIndex === null) return undefined;
  return model.items.find((item) => !item.allDay && item.status === 'upcoming')?.key;
}

/** How far through an event that is happening now we are, from 0 to 1. */
export function progressOf(item: AgendaItem, nowMin: number): number {
  const length = item.endMin - item.startMin;
  if (item.status !== 'now' || length <= 0) return 0;
  return Math.min(1, Math.max(0, (nowMin - item.startMin) / length));
}

/** "in 40 minutes" / "بعد ٤٠ دقيقة": minutes under an hour, otherwise whole hours; empty when due. */
export function untilLabel(
  minutes: number,
  locale: string,
  numerals: 'latn' | 'arab' = 'latn',
): string {
  if (minutes <= 0) return '';
  const f = new Intl.RelativeTimeFormat(locale, { numeric: 'always', numberingSystem: numerals });
  return minutes < 60 ? f.format(minutes, 'minute') : f.format(Math.floor(minutes / 60), 'hour');
}

export function minuteOfNow(nowLocal: string): number {
  return Number(nowLocal.slice(11, 13)) * 60 + Number(nowLocal.slice(14, 16));
}
