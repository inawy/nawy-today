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

/** Where a panel leaves to: a sheet drops down, a drawer goes back to the side it came from. */
export type CloseDirection = 'down' | 'inline-start';

/**
 * A deliberate swipe that sends a panel away (D-063): long enough, quick enough and clearly in
 * the panel's direction, so that scrolling and taps inside it never close it by accident. A drawer
 * leaves toward the inline start (to the right in Arabic).
 */
export function closeSwipe(move: SwipeMove, direction: CloseDirection, rtl: boolean): boolean {
  const { dx, dy, ms } = move;
  if (ms > MAX_MS) return false;
  if (direction === 'down') {
    return dy >= MIN_DISTANCE_PX && dy >= Math.abs(dx) * 1.5;
  }
  if (Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 2) return false;
  return rtl ? dx > 0 : dx < 0;
}
