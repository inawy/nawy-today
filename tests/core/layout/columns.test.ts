import { describe, expect, it } from 'vitest';
import { layoutColumns } from '@/core/layout';
import type { ColumnItem, ColumnPlacement } from '@/core/layout';

const item = (id: string, startMin: number, endMin: number): ColumnItem => ({
  id,
  startMin,
  endMin,
});
const by = (ps: ColumnPlacement[]) => Object.fromEntries(ps.map((p) => [p.id, p]));

describe('layoutColumns', () => {
  it('gives a lone event the full width', () => {
    expect(layoutColumns([item('a', 540, 600)])).toEqual([
      { id: 'a', column: 0, columnCount: 1, span: 1 },
    ]);
  });

  it('puts back-to-back events in the same column (touching is not overlapping)', () => {
    const p = by(layoutColumns([item('a', 540, 600), item('b', 600, 660)]));
    expect(p['a']).toMatchObject({ column: 0, columnCount: 1 });
    expect(p['b']).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('splits two overlapping events into two columns', () => {
    const p = by(layoutColumns([item('a', 540, 660), item('b', 600, 720)]));
    expect(p['a']).toMatchObject({ column: 0, columnCount: 2, span: 1 });
    expect(p['b']).toMatchObject({ column: 1, columnCount: 2, span: 1 });
  });

  it('identical events sit side by side', () => {
    const p = layoutColumns([item('a', 540, 600), item('b', 540, 600), item('c', 540, 600)]);
    expect(p.map((x) => x.column).sort()).toEqual([0, 1, 2]);
    expect(p.every((x) => x.columnCount === 3 && x.span === 1)).toBe(true);
  });

  it('widens an event over columns that are free for its whole duration', () => {
    // a is long; b and c overlap a and each other only in part; d only overlaps a late.
    const p = by(
      layoutColumns([
        item('a', 540, 720),
        item('b', 540, 600),
        item('c', 560, 620),
        item('d', 650, 700),
      ]),
    );
    expect(p['a']).toMatchObject({ column: 0, columnCount: 3, span: 1 });
    expect(p['d']?.column).toBe(1);
    expect(p['d']?.span).toBe(2); // column 2 is free from 620 on
  });

  it('keeps separate clusters independent', () => {
    const p = by(layoutColumns([item('a', 540, 600), item('b', 570, 630), item('c', 700, 760)]));
    expect(p['a']?.columnCount).toBe(2);
    expect(p['c']).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('chains: a overlaps b, b overlaps c, a does not overlap c → one cluster, c reuses a column', () => {
    const p = by(layoutColumns([item('a', 540, 600), item('b', 580, 660), item('c', 640, 700)]));
    expect(p['a']?.columnCount).toBe(2);
    expect(p['c']).toMatchObject({ column: 0, columnCount: 2 });
  });

  it('treats short and zero-length events as at least the minimum duration', () => {
    const p = by(layoutColumns([item('a', 540, 600), item('z', 545, 545)]));
    expect(p['z']).toMatchObject({ column: 1, columnCount: 2 });
    const q = by(layoutColumns([item('x', 540, 540), item('y', 540, 540)]));
    expect(q['x']?.columnCount).toBe(2);
  });

  it('is deterministic whatever the input order, and returns placements in input order', () => {
    const items = [item('b', 600, 700), item('a', 540, 660), item('c', 540, 660)];
    const one = layoutColumns(items);
    const two = layoutColumns([...items].reverse());
    expect(by(one)).toEqual(by(two));
    expect(one.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('handles an empty list', () => {
    expect(layoutColumns([])).toEqual([]);
  });
});

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('layoutColumns invariants (seeded random days)', () => {
  it('no two events ever overlap on screen, and every placement is inside its cluster', () => {
    const rnd = prng(4242);
    const min = 15;
    for (let round = 0; round < 300; round += 1) {
      const n = Math.floor(rnd() * 25);
      const items = Array.from({ length: n }, (_, i) => {
        const start = Math.floor(rnd() * 96) * 15;
        const dur = rnd() < 0.15 ? 0 : (1 + Math.floor(rnd() * 8)) * 15;
        return item(`e${i}`, start, Math.min(1440, start + dur));
      });
      const placed = layoutColumns(items, { minDurationMin: min });
      expect(placed).toHaveLength(n);
      const eff = (i: ColumnItem) => Math.max(i.endMin, i.startMin + min);
      for (let i = 0; i < n; i += 1) {
        const a = placed[i] as ColumnPlacement;
        expect(a.column).toBeGreaterThanOrEqual(0);
        expect(a.span).toBeGreaterThanOrEqual(1);
        expect(a.column + a.span).toBeLessThanOrEqual(a.columnCount);
        for (let j = i + 1; j < n; j += 1) {
          const b = placed[j] as ColumnPlacement;
          const x = items[i] as ColumnItem;
          const y = items[j] as ColumnItem;
          const timeOverlap = x.startMin < eff(y) && y.startMin < eff(x);
          if (!timeOverlap) continue;
          // overlapping in time ⇒ same cluster ⇒ disjoint column ranges
          expect(a.columnCount).toBe(b.columnCount);
          const disjoint = a.column + a.span <= b.column || b.column + b.span <= a.column;
          expect(disjoint, `${x.id} vs ${y.id}`).toBe(true);
        }
      }
    }
  });
});
