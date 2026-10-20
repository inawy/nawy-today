import Dexie, { type EntityTable } from 'dexie';
import {
  parseEnvelope,
  serializeEnvelope,
  type Envelope,
  type EnvelopeError,
  type Result,
} from '@/core/model';
import { nowMs } from '@/core/time';
import {
  applyImport,
  applyReplace,
  exportEnvelope,
  type ImportResult,
  type ReplaceResult,
} from './backup';
import type { NawyDb } from './schema';

// Automatic local snapshots (D-008). They live in their OWN database, so a problem in the main
// one cannot take the safety copies down with it. This file is one of only two in src/data that
// may delete records (enforced by lint); here it only ever deletes old snapshots.

export const SNAPSHOT_DB_NAME = 'nawy-today-snapshots';
export const KEEP_SNAPSHOTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

export type SnapshotReason = 'daily' | 'before-import' | 'before-restore' | 'manual';

export interface Snapshot {
  id: number;
  createdAt: number;
  reason: SnapshotReason;
  /** The newest `updatedAt` in the data when the snapshot was taken: "has anything changed?". */
  stamp: number;
  bytes: number;
  /** The serialised envelope. */
  json: string;
}

export type SnapshotInfo = Omit<Snapshot, 'json'>;

export type SnapshotDb = Dexie & { snapshots: EntityTable<Snapshot, 'id'> };

export function createSnapshotDb(name: string = SNAPSHOT_DB_NAME): SnapshotDb {
  const db = new Dexie(name) as SnapshotDb;
  db.version(1).stores({ snapshots: '++id, createdAt, reason' });
  return db;
}

/** About 10% of the storage quota, kept between 20 MB and 150 MB. */
export function snapshotBudgetBytes(quotaBytes?: number): number {
  if (quotaBytes === undefined || !Number.isFinite(quotaBytes)) return 20 * MB;
  return Math.min(150 * MB, Math.max(20 * MB, Math.floor(quotaBytes * 0.1)));
}

/** The newest `updatedAt` across calendars and events (0 when empty). */
export async function dataStamp(db: NawyDb): Promise<number> {
  const [event, calendar] = await Promise.all([
    db.events.orderBy('updatedAt').last(),
    db.calendars.orderBy('updatedAt').last(),
  ]);
  return Math.max(event?.updatedAt ?? 0, calendar?.updatedAt ?? 0);
}

export interface PruneOptions {
  keep?: number;
  budgetBytes?: number;
}

/** Keeps the newest `keep` snapshots, then drops the oldest while over budget (never the last). */
export async function pruneSnapshots(
  snapshotDb: SnapshotDb,
  { keep = KEEP_SNAPSHOTS, budgetBytes = snapshotBudgetBytes() }: PruneOptions = {},
): Promise<number> {
  const all = (await snapshotDb.snapshots.toArray()).sort((a, b) => b.id - a.id);
  const kept = all.slice(0, keep);
  const doomed = all.slice(keep);

  let total = kept.reduce((sum, s) => sum + s.bytes, 0);
  while (kept.length > 1 && total > budgetBytes) {
    const oldest = kept.pop();
    if (!oldest) break;
    total -= oldest.bytes;
    doomed.push(oldest);
  }

  await snapshotDb.snapshots.bulkDelete(doomed.map((s) => s.id));
  return doomed.length;
}

export async function takeSnapshot(
  db: NawyDb,
  snapshotDb: SnapshotDb,
  reason: SnapshotReason,
  now: () => number = nowMs,
  prune: PruneOptions = {},
): Promise<SnapshotInfo> {
  const createdAt = now();
  const [envelope, stamp] = await Promise.all([exportEnvelope(db, createdAt), dataStamp(db)]);
  const json = serializeEnvelope(envelope);
  const bytes = new TextEncoder().encode(json).length;
  const id = await snapshotDb.snapshots.add({ createdAt, reason, stamp, bytes, json });
  await pruneSnapshots(snapshotDb, prune);
  return { id, createdAt, reason, stamp, bytes };
}

/**
 * Takes a daily snapshot only when something changed since the last daily one AND at least a
 * day has passed. Returns undefined when it decided not to.
 */
export async function maybeTakeDailySnapshot(
  db: NawyDb,
  snapshotDb: SnapshotDb,
  now: () => number = nowMs,
  prune: PruneOptions = {},
): Promise<SnapshotInfo | undefined> {
  const stamp = await dataStamp(db);
  if (stamp === 0) return undefined;

  const last = await snapshotDb.snapshots.where('reason').equals('daily').last();
  if (last && (last.stamp === stamp || now() - last.createdAt < DAY_MS)) return undefined;
  return takeSnapshot(db, snapshotDb, 'daily', now, prune);
}

/** Newest first, without the (large) payload. */
export async function listSnapshots(snapshotDb: SnapshotDb): Promise<SnapshotInfo[]> {
  const all = await snapshotDb.snapshots.toArray();
  return all
    .sort((a, b) => b.id - a.id)
    .map(({ id, createdAt, reason, stamp, bytes }) => ({ id, createdAt, reason, stamp, bytes }));
}

/** The parsed snapshot, or an error result if its contents are damaged. Undefined if no such id. */
export async function getSnapshotEnvelope(
  snapshotDb: SnapshotDb,
  id: number,
): Promise<Result<Envelope, EnvelopeError> | undefined> {
  const snapshot = await snapshotDb.snapshots.get(id);
  return snapshot ? parseEnvelope(snapshot.json) : undefined;
}

/** Imports an envelope after first taking a safety snapshot of the current data. */
export async function importWithSafetySnapshot(
  db: NawyDb,
  snapshotDb: SnapshotDb,
  envelope: Envelope,
  now: () => number = nowMs,
): Promise<ImportResult> {
  await takeSnapshot(db, snapshotDb, 'before-import', now);
  return applyImport(db, envelope, now);
}

/** Replaces the data with an envelope after first taking a safety snapshot of the current data. */
export async function replaceWithSafetySnapshot(
  db: NawyDb,
  snapshotDb: SnapshotDb,
  envelope: Envelope,
  reason: 'before-import' | 'before-restore',
  now: () => number = nowMs,
): Promise<ReplaceResult> {
  await takeSnapshot(db, snapshotDb, reason, now);
  return applyReplace(db, envelope, now);
}

/** The stored file text of a snapshot, as it would be downloaded. Undefined if no such id. */
export async function getSnapshotJson(
  snapshotDb: SnapshotDb,
  id: number,
): Promise<{ createdAt: number; json: string } | undefined> {
  const snapshot = await snapshotDb.snapshots.get(id);
  return snapshot && { createdAt: snapshot.createdAt, json: snapshot.json };
}
