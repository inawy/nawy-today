import { describe, expect, it } from 'vitest';
import { FAB_HIDE_PX, FAB_SHOW_PX, fabAfterScroll } from '@/features/view';

describe('fabAfterScroll: the add button while scrolling', () => {
  it('hides when the content moves down past a small threshold', () => {
    expect(fabAfterScroll(true, FAB_HIDE_PX, false)).toBe(false);
    expect(fabAfterScroll(true, 200, false)).toBe(false);
  });
  it('returns when scrolling up past a smaller threshold', () => {
    expect(fabAfterScroll(false, -FAB_SHOW_PX, false)).toBe(true);
    expect(fabAfterScroll(false, -120, false)).toBe(true);
  });
  it('keeps its state for tiny movements, so it does not flicker', () => {
    expect(fabAfterScroll(true, FAB_HIDE_PX - 1, false)).toBe(true);
    expect(fabAfterScroll(false, -(FAB_SHOW_PX - 1), false)).toBe(false);
    expect(fabAfterScroll(false, 3, false)).toBe(false);
  });
  it('is always shown at the very top', () => {
    expect(fabAfterScroll(false, 50, true)).toBe(true);
    expect(fabAfterScroll(false, 0, true)).toBe(true);
  });
});
