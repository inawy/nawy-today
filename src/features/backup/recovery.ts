import type { SnapshotDb } from '@/data';
import { getSnapshotJson, listSnapshots } from '@/data';
import type { TimeZoneId } from '@/core/time';
import { backupFileName } from './files';
import type { FileToSave } from './dataTools';

/**
 * The newest snapshot as a file, for when the main data cannot be opened. Snapshots live in a
 * different database, so they can still be readable. Undefined when there are none.
 */
export async function latestSnapshotFile(
  snapshotDb: SnapshotDb,
  timeZone: TimeZoneId,
): Promise<FileToSave | undefined> {
  const [newest] = await listSnapshots(snapshotDb);
  if (!newest) return undefined;
  const found = await getSnapshotJson(snapshotDb, newest.id);
  if (!found) return undefined;
  return {
    name: backupFileName(found.createdAt, timeZone).replace(
      'nawy-today-',
      'nawy-today-snapshot-',
    ),
    text: found.json,
  };
}
