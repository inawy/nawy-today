import type { Versioned } from './types';

// Last-writer-wins by `updatedAt`, per record. Live records and tombstones compete on equal
// terms: the newest write wins, so a deletion beats an older edit and a newer edit beats an
// older deletion. On an exact tie a tombstone wins ("the newest deletion wins", D-008);
// otherwise the local record is kept, which makes re-importing the same file a no-op.

export interface MergePlan<T> {
  /** Incoming live records that do not exist locally. */
  added: T[];
  /** Incoming live records newer than the local record (including over a local tombstone). */
  updated: T[];
  /** Incoming tombstones that delete a live local record. */
  deleted: T[];
  /** Tombstones stored without changing anything visible (unknown id, or newer tombstone). */
  tombstones: T[];
  /** Incoming records identical in age to the local record: nothing to do. */
  same: number;
  /** Incoming records older than the local record: ignored. */
  older: number;
}

export function planMerge<T extends Versioned>(
  local: ReadonlyMap<string, T>,
  incoming: readonly T[],
): MergePlan<T> {
  const plan: MergePlan<T> = {
    added: [],
    updated: [],
    deleted: [],
    tombstones: [],
    same: 0,
    older: 0,
  };

  for (const inc of incoming) {
    const cur = local.get(inc.id);
    const incDeleted = inc.deletedAt !== undefined;

    if (!cur) {
      (incDeleted ? plan.tombstones : plan.added).push(inc);
      continue;
    }

    const curDeleted = cur.deletedAt !== undefined;
    if (inc.updatedAt < cur.updatedAt) {
      plan.older += 1;
    } else if (inc.updatedAt === cur.updatedAt) {
      if (incDeleted && !curDeleted) plan.deleted.push(inc);
      else plan.same += 1;
    } else if (!incDeleted) {
      plan.updated.push(inc);
    } else if (curDeleted) {
      plan.tombstones.push(inc);
    } else {
      plan.deleted.push(inc);
    }
  }

  return plan;
}

/** Every record a plan asks to be written. */
export function recordsToWrite<T>(plan: MergePlan<T>): T[] {
  return [...plan.added, ...plan.updated, ...plan.deleted, ...plan.tombstones];
}
