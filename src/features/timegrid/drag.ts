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

/** One keyboard step of time, the same as one drag step. */
export const KEY_STEP_MINUTES = 15;

export type KeyAction =
  | { readonly kind: 'move'; readonly days: number; readonly minutes: number }
  | { readonly kind: 'resize'; readonly minutes: number };

export interface KeyModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/**
 * What a key press on a focused block does (D-046), by `event.code`:
 * Shift + ↑/↓ moves it a step earlier/later, Shift + ←/→ a day (the arrow points where the block
 * goes on screen, so in a right-to-left page → is the earlier day), and Ctrl + Shift + ↑/↓ moves
 * only its end. Anything else is not ours: `undefined`.
 */
export function keyAction(code: string, mods: KeyModifiers, rtl: boolean): KeyAction | undefined {
  if (!mods.shift || mods.alt || mods.meta) return undefined;
  const vertical = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
  if (mods.ctrl) {
    return vertical === 0 ? undefined : { kind: 'resize', minutes: vertical * KEY_STEP_MINUTES };
  }
  if (vertical !== 0) return { kind: 'move', days: 0, minutes: vertical * KEY_STEP_MINUTES };
  if (code === 'ArrowRight') return { kind: 'move', days: rtl ? -1 : 1, minutes: 0 };
  if (code === 'ArrowLeft') return { kind: 'move', days: rtl ? 1 : -1, minutes: 0 };
  return undefined;
}
