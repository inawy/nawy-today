export interface SwipeMove {
  readonly dx: number;
  readonly dy: number;
  /** How long the finger was down, in milliseconds. */
  readonly ms: number;
}

export type SwipeIntent = 'next' | 'previous' | null;

const MIN_DISTANCE_PX = 64;
const MAX_MS = 600;

/**
 * A deliberate sideways swipe moves the calendar. It must be mostly horizontal (so scrolling
 * stays scrolling), long enough, and quick enough. Dragging the content toward the start of the
 * reading direction means "next" — in Arabic that is a swipe to the right, as in the paper page.
 */
export function swipeIntent(move: SwipeMove, rtl: boolean): SwipeIntent {
  const { dx, dy, ms } = move;
  if (ms > MAX_MS) return null;
  if (Math.abs(dx) < MIN_DISTANCE_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * 2) return null;
  const towardStart = rtl ? dx > 0 : dx < 0;
  return towardStart ? 'next' : 'previous';
}
