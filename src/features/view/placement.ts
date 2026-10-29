export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Size {
  readonly width: number;
  readonly height: number;
}

const MARGIN = 8;
const GAP_X = 12;
const LIFT_Y = 24;

/**
 * Where to put a card of `card` size beside a tap (D-073): a little to the side of it and raised,
 * and always fully inside the viewport. `inlineStart` is measured from the edge the text starts
 * on, so the same number works in a right-to-left page (where that edge is the right one).
 */
export function placeBeside(
  point: Point,
  card: Size,
  viewport: Size,
  rtl: boolean,
): { readonly top: number; readonly inlineStart: number } {
  const maxLeft = viewport.width - card.width - MARGIN;
  const maxTop = viewport.height - card.height - MARGIN;
  const left = Math.max(Math.min(point.x + GAP_X, maxLeft), MARGIN);
  const top = Math.max(Math.min(point.y - LIFT_Y, maxTop), MARGIN);
  const inlineStart = rtl ? viewport.width - left - card.width : left;
  return { top, inlineStart: Math.max(inlineStart, MARGIN) };
}
