import { describe, expect, it } from 'vitest';
import { swipeIntent } from '@/features/view';

describe('swipeIntent', () => {
  it('left-to-right reading: dragging left goes forward, right goes back', () => {
    expect(swipeIntent({ dx: -120, dy: 10, ms: 200 }, false)).toBe('next');
    expect(swipeIntent({ dx: 120, dy: 10, ms: 200 }, false)).toBe('previous');
  });

  it('right-to-left reading mirrors it', () => {
    expect(swipeIntent({ dx: 120, dy: 10, ms: 200 }, true)).toBe('next');
    expect(swipeIntent({ dx: -120, dy: 10, ms: 200 }, true)).toBe('previous');
  });

  it('ignores short, slow and mostly vertical movements', () => {
    expect(swipeIntent({ dx: -30, dy: 0, ms: 100 }, false)).toBeNull();
    expect(swipeIntent({ dx: -200, dy: 0, ms: 900 }, false)).toBeNull();
    expect(swipeIntent({ dx: -100, dy: 90, ms: 200 }, false)).toBeNull();
  });
});
