import { compareDates } from '@/core/time';
import type { PlainDate } from '@/core/time';
import type { ViewKind } from './nav';

export type ViewMotion = 'next' | 'previous' | 'swap' | 'none';

interface Position {
  readonly view: ViewKind;
  readonly anchor: PlainDate;
}

/** Which way the content should slide when moving from one position to another. */
export function motionBetween(from: Position, to: Position): ViewMotion {
  if (from.view !== to.view) return 'swap';
  const order = compareDates(from.anchor, to.anchor);
  return order < 0 ? 'next' : order > 0 ? 'previous' : 'none';
}
