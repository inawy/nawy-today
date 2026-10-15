// Layout of multi-day bars in ONE week row of the month grid, with a "+N more" overflow.
// Days are epoch days (core/time civil math); the row has 7 columns 0…6.

export interface SpanItem {
  readonly id: string;
  /** First and last day covered (inclusive), as epoch days. */
  readonly startDay: number;
  readonly endDay: number;
}

export interface BarSegment {
  readonly id: string;
  /** 0-based row under the day numbers. */
  readonly lane: number;
  /** Columns 0…6, inclusive. */
  readonly startCol: number;
  readonly endCol: number;
  /** The item started before this week / continues after it (draw an open edge). */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface WeekRowLayout {
  readonly segments: BarSegment[];
  /** Per column: how many items touch that day but are not drawn. A "+N" goes in the last lane. */
  readonly hidden: number[];
}

/**
 * `weekStartDay` is the epoch day of the row's first column. `maxLanes` (≥ 1) is how many rows
 * fit; when anything is hidden, the last row is given to the "+N" labels of the days concerned,
 * so a day shows either all its items or (maxLanes − 1) of them plus "+N".
 */
export function layoutWeekRow(
  items: readonly SpanItem[],
  weekStartDay: number,
  maxLanes: number,
): WeekRowLayout {
  if (!Number.isInteger(maxLanes) || maxLanes < 1) throw new RangeError('maxLanes must be ≥ 1');

  const clipped = items
    .filter((i) => i.endDay >= weekStartDay && i.startDay <= weekStartDay + 6)
    .map((i) => ({
      id: i.id,
      startCol: Math.max(i.startDay, weekStartDay) - weekStartDay,
      endCol: Math.min(i.endDay, weekStartDay + 6) - weekStartDay,
      continuesBefore: i.startDay < weekStartDay,
      continuesAfter: i.endDay > weekStartDay + 6,
    }))
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.endCol - b.startCol - (a.endCol - a.startCol) ||
        a.id.localeCompare(b.id),
    );

  // Unlimited lanes first: the first lane free over the item's whole column range.
  const laneEnds: number[][] = []; // per lane, the columns taken
  const placed = clipped.map((item) => {
    let lane = laneEnds.findIndex(
      (taken) => !taken.some((col) => col >= item.startCol && col <= item.endCol),
    );
    if (lane < 0) {
      laneEnds.push([]);
      lane = laneEnds.length - 1;
    }
    for (let c = item.startCol; c <= item.endCol; c += 1) laneEnds[lane]?.push(c);
    return { ...item, lane };
  });

  // Hide what does not fit; a day with hidden items also loses the item in the "+N" row. That can
  // hide more items (and make more days need a "+N"), so repeat until stable. Only grows ⇒ ends.
  const hiddenIds = new Set<string>(placed.filter((p) => p.lane >= maxLanes).map((p) => p.id));
  const hiddenOn = (): number[] => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const p of placed) {
      if (!hiddenIds.has(p.id)) continue;
      for (let c = p.startCol; c <= p.endCol; c += 1) counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  };
  for (;;) {
    const counts = hiddenOn();
    let changed = false;
    for (const p of placed) {
      if (hiddenIds.has(p.id) || p.lane !== maxLanes - 1) continue;
      let touchesOverflowDay = false;
      for (let c = p.startCol; c <= p.endCol; c += 1)
        if ((counts[c] ?? 0) > 0) touchesOverflowDay = true;
      if (touchesOverflowDay) {
        hiddenIds.add(p.id);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return {
    segments: placed
      .filter((p) => !hiddenIds.has(p.id))
      .map(({ id, lane, startCol, endCol, continuesBefore, continuesAfter }) => ({
        id,
        lane,
        startCol,
        endCol,
        continuesBefore,
        continuesAfter,
      })),
    hidden: hiddenOn(),
  };
}
