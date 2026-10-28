import { describe, expect, it } from 'vitest';
import { closeSwipe, swipeIntent } from '@/features/view';

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

describe('closeSwipe', () => {
  const quick = { ms: 200 };

  it('a sheet closes on a clear, quick swipe down', () => {
    expect(closeSwipe({ dx: 5, dy: 90, ...quick }, 'down', false)).toBe(true);
  });
  it('a sheet stays on a short, slow, upward or sideways swipe', () => {
    expect(closeSwipe({ dx: 0, dy: 40, ...quick }, 'down', false)).toBe(false);
    expect(closeSwipe({ dx: 0, dy: 90, ms: 900 }, 'down', false)).toBe(false);
    expect(closeSwipe({ dx: 0, dy: -90, ...quick }, 'down', false)).toBe(false);
    expect(closeSwipe({ dx: 90, dy: 90, ...quick }, 'down', false)).toBe(false);
  });
  it('a drawer leaves toward the side it came from: right in Arabic, left in English', () => {
    expect(closeSwipe({ dx: 90, dy: 5, ...quick }, 'inline-start', true)).toBe(true);
    expect(closeSwipe({ dx: -90, dy: 5, ...quick }, 'inline-start', true)).toBe(false);
    expect(closeSwipe({ dx: -90, dy: 5, ...quick }, 'inline-start', false)).toBe(true);
    expect(closeSwipe({ dx: 90, dy: 5, ...quick }, 'inline-start', false)).toBe(false);
  });
  it('a drawer ignores short, slow or mostly vertical swipes (scrolling stays scrolling)', () => {
    expect(closeSwipe({ dx: -40, dy: 0, ...quick }, 'inline-start', false)).toBe(false);
    expect(closeSwipe({ dx: -90, dy: 0, ms: 900 }, 'inline-start', false)).toBe(false);
    expect(closeSwipe({ dx: -90, dy: 80, ...quick }, 'inline-start', false)).toBe(false);
  });
});
