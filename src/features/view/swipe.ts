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

const SLOW_CARRY_PX = 120;
/** How far a panel moves before it counts as "being dragged away" at all. */
export const DRAG_START_PX = 8;

/** What a released drag does to a panel that followed the finger. */
export type DragOutcome = 'close' | 'back';

/**
 * A panel that follows the finger (D-074) closes on a quick flick (`closeSwipe`) or when it has
 * been carried far enough, however slowly; anything less springs back to where it was.
 */
export function settleDrag(move: SwipeMove, direction: CloseDirection, rtl: boolean): DragOutcome {
  if (closeSwipe(move, direction, rtl)) return 'close';
  const { dx, dy } = move;
  if (direction === 'down') {
    return dy >= SLOW_CARRY_PX && dy >= Math.abs(dx) * 1.5 ? 'close' : 'back';
  }
  const toward = rtl ? dx > 0 : dx < 0;
  return toward && Math.abs(dx) >= SLOW_CARRY_PX && Math.abs(dx) >= Math.abs(dy) * 2
    ? 'close'
    : 'back';
}

/**
 * Whether a first movement starts dragging the panel or leaves the touch alone (a scroll, a tap):
 * decided once, from the first few pixels, in the closing direction.
 */
export function startsDrag(
  move: Pick<SwipeMove, 'dx' | 'dy'>,
  direction: CloseDirection,
  rtl: boolean,
): boolean {
  const { dx, dy } = move;
  if (direction === 'down') return dy > 0 && dy >= Math.abs(dx) * 1.5;
  const toward = rtl ? dx > 0 : dx < 0;
  return toward && Math.abs(dx) >= Math.abs(dy) * 2;
}

/** How far to draw the panel for a finger movement: only in the closing direction, never back. */
export function dragOffset(
  move: Pick<SwipeMove, 'dx' | 'dy'>,
  direction: CloseDirection,
  rtl: boolean,
): { readonly x: number; readonly y: number } {
  if (direction === 'down') return { x: 0, y: Math.max(0, move.dy) };
  return { x: rtl ? Math.max(0, move.dx) : Math.min(0, move.dx), y: 0 };
}
