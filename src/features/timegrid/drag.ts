export interface DragInput {
  /** Pointer movement since the drag began, in CSS pixels. */
  readonly dx: number;
  readonly dy: number;
  /** Width of one day column. */
  readonly columnWidth: number;
  /** Height of one hour. */
  readonly hourPx: number;
  /** Right-to-left pages lay days out from the right, so moving right goes back in time. */
  readonly rtl: boolean;
  /** Time is caught to this many minutes. */
  readonly stepMinutes: number;
}

export interface DragDelta {
  readonly days: number;
  readonly minutes: number;
}

/** Turns pointer movement into "this many days and minutes", caught to the step. */
export function dragDelta(input: DragInput): DragDelta {
  const { dx, dy, columnWidth, hourPx, rtl, stepMinutes } = input;
  const columns = columnWidth > 0 ? Math.round(dx / columnWidth) : 0;
  const days = (rtl ? -columns : columns) || 0; // `|| 0` turns -0 into 0
  const raw = (dy / hourPx) * 60;
  const minutes = Math.round(raw / stepMinutes) * stepMinutes || 0;
  return { days, minutes };
}

/** Moving a finger more than this before the hold fires means the person is scrolling. */
export const SCROLL_SLOP_PX = 8;
/** How long a finger must rest before a block picks up (D-013). */
export const HOLD_MS = 130;
/** A mouse starts a drag after this much movement (a click stays a click). */
export const MOUSE_SLOP_PX = 4;
