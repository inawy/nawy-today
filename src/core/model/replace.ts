import { nextUpdatedAt } from './tombstone';
import type { Versioned } from './types';

// "Make this device look like that file" (restore). Merging cannot do it: merge is last-writer
// wins, so something deleted after the backup was taken stays deleted, which is exactly what a
// person restoring a backup wants to undo. A replace writes NEW versions (higher `updatedAt`) of
// whatever has to change and tombstones what the file does not have, so nothing is ever removed
// physically (D-008) and the result still merges correctly with any other copy later.

export interface ReplacePlan<T> {
  /** Every record to write, already carrying its new `updatedAt`. */
  write: T[];
  /** Live in the file, missing or deleted here. */
  added: number;
  /** Live on both sides with different content. */
  changed: number;
  /** Live here, missing or deleted in the file: they will be deleted. */
  removed: number;
  /** Already the same: nothing to do. */
  same: number;
}

/** Content without the version stamps, in a stable key order, for "are these the same?". */
function fingerprint(record: Versioned): string {
  const entries = Object.entries(record)
    .filter(([key]) => key !== 'updatedAt' && key !== 'deletedAt')
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(entries);
}

export function planReplace<T extends Versioned>(
  local: ReadonlyMap<string, T>,
  incoming: readonly T[],
  tombstone: (record: T, now: number) => T,
  now: number,
): ReplacePlan<T> {
  const plan: ReplacePlan<T> = { write: [], added: 0, changed: 0, removed: 0, same: 0 };
  const seen = new Set<string>();

  for (const inc of incoming) {
    seen.add(inc.id);
    const cur = local.get(inc.id);
    const curLive = cur !== undefined && cur.deletedAt === undefined;

    if (inc.deletedAt !== undefined) {
      if (curLive) {
        plan.write.push(tombstone(cur, now));
        plan.removed += 1;
      } else {
        // Unknown id: keep the tombstone so an older file cannot bring it back later.
        if (cur === undefined) plan.write.push(inc);
        plan.same += 1;
      }
      continue;
    }

    if (curLive && fingerprint(cur) === fingerprint(inc)) {
      plan.same += 1;
      continue;
    }
    plan.write.push({ ...inc, updatedAt: nextUpdatedAt(cur?.updatedAt ?? inc.updatedAt, now) });
    if (curLive) plan.changed += 1;
    else plan.added += 1;
  }

  for (const [id, cur] of local) {
    if (seen.has(id) || cur.deletedAt !== undefined) continue;
    plan.write.push(tombstone(cur, now));
    plan.removed += 1;
  }
  return plan;
}
