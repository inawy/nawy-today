// Side-by-side layout of overlapping events inside a day column (the time grid).
//
// Events that overlap in time form a cluster. Inside a cluster each event takes the first free
// column, then widens to the right across columns that are free for its whole duration. Result:
// no two events ever overlap on screen, and events only share width with the events they
// actually collide with (transitively).

export interface ColumnItem {
  readonly id: string;
  readonly startMin: number;
  readonly endMin: number;
}

export interface ColumnPlacement {
  readonly id: string;
  /** 0-based column inside its cluster. */
  readonly column: number;
  /** Number of columns of the cluster: width = 1/columnCount of the day column. */
  readonly columnCount: number;
  /** How many columns it spans (≥ 1): width = span/columnCount. */
  readonly span: number;
}

export interface ColumnOptions {
  /**
   * Events shorter than this are laid out as if this long, so a 5-minute or zero-length event
   * still gets its own visible slot instead of hiding under a neighbour. Default 15.
   */
  readonly minDurationMin?: number;
}

export function layoutColumns(
  items: readonly ColumnItem[],
  options: ColumnOptions = {},
): ColumnPlacement[] {
  const minDuration = options.minDurationMin ?? 15;
  const sorted = items
    .map((item) => ({ ...item, effEnd: Math.max(item.endMin, item.startMin + minDuration) }))
    .sort((a, b) => a.startMin - b.startMin || b.effEnd - a.effEnd || a.id.localeCompare(b.id));

  type Entry = (typeof sorted)[number];
  const placements = new Map<string, ColumnPlacement>();

  const flush = (cluster: Entry[]): void => {
    const columns: Entry[][] = [];
    const columnOf = new Map<Entry, number>();
    for (const item of cluster) {
      let c = columns.findIndex((col) => (col[col.length - 1]?.effEnd ?? 0) <= item.startMin);
      if (c < 0) {
        columns.push([]);
        c = columns.length - 1;
      }
      columns[c]?.push(item);
      columnOf.set(item, c);
    }
    for (const item of cluster) {
      const column = columnOf.get(item) ?? 0;
      let span = 1;
      while (column + span < columns.length) {
        const blocked = columns[column + span]?.some(
          (other) => other.startMin < item.effEnd && other.effEnd > item.startMin,
        );
        if (blocked) break;
        span += 1;
      }
      placements.set(item.id, { id: item.id, column, columnCount: columns.length, span });
    }
  };

  let cluster: Entry[] = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) {
      flush(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.effEnd);
  }
  if (cluster.length > 0) flush(cluster);

  return items.flatMap((item) => {
    const p = placements.get(item.id);
    return p ? [p] : [];
  });
}
