import { describe, expect, it } from 'vitest';
import {
  closeSwipe,
  dragOffset,
  settleDrag,
  startsDrag,
  swipeIntent,
  verticalSwipeIntent,
} from '@/features/view';

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

describe('settleDrag: a panel that followed the finger', () => {
  it('closes on a quick flick, as before', () => {
    expect(settleDrag({ dx: 0, dy: 90, ms: 200 }, 'down', false)).toBe('close');
    expect(settleDrag({ dx: -90, dy: 0, ms: 200 }, 'inline-start', false)).toBe('close');
  });
  it('also closes when carried far enough, however slowly', () => {
    expect(settleDrag({ dx: 0, dy: 140, ms: 2000 }, 'down', false)).toBe('close');
    expect(settleDrag({ dx: 150, dy: 5, ms: 2000 }, 'inline-start', true)).toBe('close');
  });
  it('springs back when it was not carried far, or was carried the wrong way', () => {
    expect(settleDrag({ dx: 0, dy: 100, ms: 2000 }, 'down', false)).toBe('back');
    expect(settleDrag({ dx: 0, dy: -200, ms: 300 }, 'down', false)).toBe('back');
    expect(settleDrag({ dx: 200, dy: 0, ms: 2000 }, 'inline-start', false)).toBe('back');
    expect(settleDrag({ dx: 150, dy: 140, ms: 2000 }, 'down', false)).toBe('back');
  });
});

describe('startsDrag and dragOffset', () => {
  it('a drag starts only in the leaving direction (so scrolling and taps are left alone)', () => {
    expect(startsDrag({ dx: 2, dy: 20 }, 'down', false)).toBe(true);
    expect(startsDrag({ dx: 0, dy: -20 }, 'down', false)).toBe(false);
    expect(startsDrag({ dx: 30, dy: 20 }, 'down', false)).toBe(false);
    expect(startsDrag({ dx: -30, dy: 5 }, 'inline-start', false)).toBe(true);
    expect(startsDrag({ dx: 30, dy: 5 }, 'inline-start', false)).toBe(false);
    expect(startsDrag({ dx: 30, dy: 5 }, 'inline-start', true)).toBe(true);
    expect(startsDrag({ dx: -30, dy: 25 }, 'inline-start', false)).toBe(false);
  });
  it('draws the panel only toward where it leaves, never back past its place', () => {
    expect(dragOffset({ dx: 9, dy: 50 }, 'down', false)).toEqual({ x: 0, y: 50 });
    expect(dragOffset({ dx: 0, dy: -50 }, 'down', false)).toEqual({ x: 0, y: 0 });
    expect(dragOffset({ dx: -40, dy: 9 }, 'inline-start', false)).toEqual({ x: -40, y: 0 });
    expect(dragOffset({ dx: 40, dy: 9 }, 'inline-start', false)).toEqual({ x: 0, y: 0 });
    expect(dragOffset({ dx: 40, dy: 9 }, 'inline-start', true)).toEqual({ x: 40, y: 0 });
  });
});

describe('verticalSwipeIntent: paging through months on a phone', () => {
  it('up brings the next month and down the previous one', () => {
    expect(verticalSwipeIntent({ dx: 5, dy: -120, ms: 250 })).toBe('next');
    expect(verticalSwipeIntent({ dx: -5, dy: 120, ms: 250 })).toBe('previous');
  });
  it('ignores short, slow and slanted movements, and sideways ones', () => {
    expect(verticalSwipeIntent({ dx: 0, dy: -30, ms: 100 })).toBeNull();
    expect(verticalSwipeIntent({ dx: 0, dy: -200, ms: 900 })).toBeNull();
    expect(verticalSwipeIntent({ dx: 80, dy: -100, ms: 200 })).toBeNull();
    expect(verticalSwipeIntent({ dx: 150, dy: 10, ms: 200 })).toBeNull();
  });
});
