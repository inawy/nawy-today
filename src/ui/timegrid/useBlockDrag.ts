import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { HOLD_MS, MOUSE_SLOP_PX, SCROLL_SLOP_PX, dragDelta } from '@/features/timegrid';
import type { DragDelta } from '@/features/timegrid';

export const STEP_MINUTES = 15;

interface Options {
  /** Pixels per hour of the grid. */
  readonly hourPx: number;
  /** How many day columns the grid has (to turn a column's width into days). */
  readonly columns: number;
  /** The grid body: its width gives the column width, its ancestor scrolls. */
  readonly gridRef: RefObject<HTMLElement | null>;
  readonly onMove: (delta: DragDelta) => void;
}

export interface BlockDrag {
  /** Present while the block is picked up: where to draw it. */
  readonly offset: { readonly x: number; readonly y: number } | undefined;
  readonly delta: DragDelta;
  /** True from the end of a drag until the click that follows it has been swallowed. */
  readonly consumeClick: () => boolean;
  readonly handlers: {
    readonly onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  };
}

const ZERO: DragDelta = { days: 0, minutes: 0 };

/**
 * Picks a block up with a mouse (after a few pixels) or a finger (after a short hold, so scrolling
 * still works), shows it following the pointer caught to the grid, and drops it on release.
 * Escape puts it back. Nothing is written until the drop.
 */
export function useBlockDrag({ hourPx, columns, gridRef, onMove }: Options): BlockDrag {
  const [offset, setOffset] = useState<{ x: number; y: number } | undefined>(undefined);
  const [delta, setDelta] = useState<DragDelta>(ZERO);
  const swallow = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>): void => {
      if (e.button !== 0 || !e.isPrimary || cleanup.current) return;
      const grid = gridRef.current;
      if (!grid) return;
      const target = e.currentTarget;
      const touch = e.pointerType !== 'mouse';
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;
      const rtl = getComputedStyle(grid).direction === 'rtl';
      const columnWidth = grid.getBoundingClientRect().width / Math.max(1, columns);
      const scroller = grid.closest<HTMLElement>('.tg-scroll');
      const startScroll = scroller?.scrollTop ?? 0;
      let active = false;
      let timer: number | undefined;
      let last: DragDelta = ZERO;

      const measure = (x: number, y: number): DragDelta => {
        const scrolled = (scroller?.scrollTop ?? 0) - startScroll;
        return dragDelta({
          dx: x - startX,
          dy: y - startY + scrolled,
          columnWidth,
          hourPx,
          rtl,
          stepMinutes: STEP_MINUTES,
        });
      };

      const stopTouchScroll = (ev: Event): void => {
        if (active) ev.preventDefault();
      };

      const finish = (): void => {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('touchmove', stopTouchScroll);
        cleanup.current = null;
        setOffset(undefined);
        setDelta(ZERO);
      };

      const begin = (): void => {
        active = true;
        try {
          target.setPointerCapture(pointerId);
        } catch {
          // Capture can fail if the pointer is already gone; the window listeners still work.
        }
      };

      function move(ev: globalThis.PointerEvent): void {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!active) {
          const moved = Math.hypot(dx, dy);
          if (touch) {
            if (moved > SCROLL_SLOP_PX) finish(); // the person is scrolling
          } else if (moved > MOUSE_SLOP_PX) {
            begin();
          }
          if (!active) return;
        }
        // Near the top or bottom edge of the scrolling area: bring more of the day into view.
        if (scroller) {
          const box = scroller.getBoundingClientRect();
          if (ev.clientY < box.top + 36) scroller.scrollTop -= 12;
          else if (ev.clientY > box.bottom - 36) scroller.scrollTop += 12;
        }
        last = measure(ev.clientX, ev.clientY);
        setDelta(last);
        setOffset({
          x: dx,
          y: dy + ((scroller?.scrollTop ?? 0) - startScroll),
        });
      }

      function up(ev: globalThis.PointerEvent): void {
        if (ev.pointerId !== pointerId) return;
        const dropped = active;
        const result = last;
        finish();
        if (dropped) {
          swallow.current = true; // the click that follows a drop must not open the card
          window.setTimeout(() => (swallow.current = false), 0);
          if (result.days !== 0 || result.minutes !== 0) onMoveRef.current(result);
        }
      }

      function cancel(ev: globalThis.PointerEvent): void {
        if (ev.pointerId === pointerId) finish();
      }

      function key(ev: KeyboardEvent): void {
        if (ev.code === 'Escape' && active) {
          ev.stopPropagation();
          swallow.current = true;
          window.setTimeout(() => (swallow.current = false), 0);
          finish();
        }
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      window.addEventListener('touchmove', stopTouchScroll, { passive: false });
      if (touch) timer = window.setTimeout(begin, HOLD_MS);
      cleanup.current = finish;
    },
    [columns, gridRef, hourPx],
  );

  const consumeClick = useCallback((): boolean => {
    if (!swallow.current) return false;
    swallow.current = false;
    return true;
  }, []);

  return { offset, delta, consumeClick, handlers: { onPointerDown } };
}
