import { describe, expect, it } from 'vitest';
import { layoutWeekRow } from '@/core/layout';
import type { SpanItem } from '@/core/layout';

const W = 1000; // an arbitrary week start (epoch day)
const span = (id: string, startCol: number, endCol: number): SpanItem => ({
  id,
  startDay: W + startCol,
  endDay: W + endCol,
});

describe('layoutWeekRow', () => {
  it('places non-overlapping items in the first lane', () => {
    const r = layoutWeekRow([span('a', 0, 1), span('b', 2, 4)], W, 3);
    expect(r.segments.map((s) => [s.id, s.lane])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
    expect(r.hidden).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('stacks overlapping items, longest first on the same start', () => {
    const r = layoutWeekRow([span('short', 1, 1), span('long', 1, 5)], W, 3);
    expect(r.segments.find((s) => s.id === 'long')?.lane).toBe(0);
    expect(r.segments.find((s) => s.id === 'short')?.lane).toBe(1);
  });

  it('clips items crossing the week edges and marks them as continuing', () => {
    const r = layoutWeekRow([{ id: 'x', startDay: W - 3, endDay: W + 9 }], W, 3);
    expect(r.segments).toEqual([
      { id: 'x', lane: 0, startCol: 0, endCol: 6, continuesBefore: true, continuesAfter: true },
    ]);
  });

  it('ignores items outside the week', () => {
    const r = layoutWeekRow(
      [
        { id: 'old', startDay: W - 5, endDay: W - 1 },
        { id: 'new', startDay: W + 7, endDay: W + 8 },
      ],
      W,
      3,
    );
    expect(r.segments).toEqual([]);
  });

  it('shows everything when it fits exactly', () => {
    const r = layoutWeekRow([span('a', 0, 0), span('b', 0, 0), span('c', 0, 0)], W, 3);
    expect(r.segments).toHaveLength(3);
    expect(r.hidden[0]).toBe(0);
  });

  it('reserves the last lane for "+N" on days that overflow', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => span(id, 0, 0));
    const r = layoutWeekRow(items, W, 3);
    expect(r.segments.map((s) => s.lane).sort()).toEqual([0, 1]);
    expect(r.hidden[0]).toBe(2);
  });

  it('a bar that crosses an overflowing day loses its place for the "+N" there', () => {
    // Monday has 3 items with room for 2 lanes: one is hidden on Monday. The wide bar in lane 1
    // covers Mon–Wed; it must yield lane 1 to the "+N" and is hidden (counted on Mon, Tue, Wed).
    const r = layoutWeekRow([span('m1', 0, 0), span('wide', 0, 2), span('m2', 0, 0)], W, 2);
    const visible = r.segments.map((s) => s.id);
    expect(visible).toHaveLength(1);
    expect(r.hidden[0]).toBe(2);
    expect(r.hidden[1]).toBe(visible.includes('wide') ? 0 : 1);
  });

  it('maxLanes 1 draws only "+N" labels on busy days', () => {
    const r = layoutWeekRow([span('a', 0, 0), span('b', 0, 0), span('c', 1, 1)], W, 1);
    expect(r.hidden[0]).toBe(2);
    expect(r.segments.map((s) => s.id)).toEqual(['c']);
  });

  it('rejects a non-positive lane count', () => {
    expect(() => layoutWeekRow([], W, 0)).toThrow(RangeError);
  });
});

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('layoutWeekRow invariants (seeded random weeks)', () => {
  it('no overlap in a lane, nothing beyond maxLanes, hidden counts add up', () => {
    const rnd = prng(777);
    for (let round = 0; round < 400; round += 1) {
      const n = Math.floor(rnd() * 14);
      const maxLanes = 1 + Math.floor(rnd() * 4);
      const items: SpanItem[] = Array.from({ length: n }, (_, i) => {
        const a = Math.floor(rnd() * 12) - 3;
        const len = Math.floor(rnd() * 6);
        return { id: `e${i}`, startDay: W + a, endDay: W + a + len };
      });
      const r = layoutWeekRow(items, W, maxLanes);

      const lanes = new Set(r.segments.map((s) => s.id));
      expect(lanes.size).toBe(r.segments.length);
      for (const s of r.segments) {
        expect(s.lane).toBeLessThan(maxLanes);
        expect(s.startCol).toBeGreaterThanOrEqual(0);
        expect(s.endCol).toBeLessThanOrEqual(6);
      }
      for (let i = 0; i < r.segments.length; i += 1) {
        for (let j = i + 1; j < r.segments.length; j += 1) {
          const a = r.segments[i]!;
          const b = r.segments[j]!;
          if (a.lane !== b.lane) continue;
          expect(a.endCol < b.startCol || b.endCol < a.startCol).toBe(true);
        }
      }
      for (let col = 0; col < 7; col += 1) {
        const touching = items.filter(
          (it) => it.startDay <= W + col && it.endDay >= W + col,
        ).length;
        const drawn = r.segments.filter((s) => s.startCol <= col && s.endCol >= col).length;
        expect(r.hidden[col]).toBe(touching - drawn);
        if ((r.hidden[col] ?? 0) > 0) {
          // the last lane is free for the "+N" label on this day
          expect(
            r.segments.some((s) => s.lane === maxLanes - 1 && s.startCol <= col && s.endCol >= col),
          ).toBe(false);
        }
      }
    }
  });
});
