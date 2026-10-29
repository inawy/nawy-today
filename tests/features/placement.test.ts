import { describe, expect, it } from 'vitest';
import { placeBeside } from '@/features/view';

const viewport = { width: 1280, height: 800 };
const card = { width: 400, height: 260 };

describe('placeBeside', () => {
  it('sits a little to the side of the tap and raised', () => {
    expect(placeBeside({ x: 300, y: 300 }, card, viewport, false)).toEqual({
      top: 276,
      inlineStart: 312,
    });
  });

  it('stays inside the viewport at every edge', () => {
    const corner = placeBeside({ x: 1270, y: 790 }, card, viewport, false);
    expect(corner).toEqual({ top: 800 - 260 - 8, inlineStart: 1280 - 400 - 8 });
    const origin = placeBeside({ x: 0, y: 0 }, card, viewport, false);
    expect(origin.top).toBe(8);
    expect(origin.inlineStart).toBe(12);
  });

  it('measures from the right edge in a right-to-left page, so the card lands at the same spot', () => {
    const ltr = placeBeside({ x: 300, y: 300 }, card, viewport, false);
    const rtl = placeBeside({ x: 300, y: 300 }, card, viewport, true);
    expect(rtl.top).toBe(ltr.top);
    // Its left edge is 312px from the left either way: 1280 - 312 - 400 from the right.
    expect(rtl.inlineStart).toBe(1280 - 312 - 400);
  });

  it('never goes negative when the card is larger than the viewport', () => {
    const spot = placeBeside({ x: 50, y: 50 }, { width: 2000, height: 2000 }, viewport, true);
    expect(spot.top).toBeGreaterThanOrEqual(8);
    expect(spot.inlineStart).toBeGreaterThanOrEqual(8);
  });
});
