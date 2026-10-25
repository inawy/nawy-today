import { serializeEnvelope } from '@/core/model';
import type { Envelope, MergePlan, ReplacePlan } from '@/core/model';
import { nowMs } from '@/core/time';
import type { TimeZoneId } from '@/core/time';
import {
  exportEnvelope,
  getSnapshotEnvelope,
  getSnapshotJson,
  importWithSafetySnapshot,
  listSnapshots,
  previewImport,
  previewReplace,
  replaceWithSafetySnapshot,
  takeSnapshot,
} from '@/data';
import type { ImportPlan, NawyDb, ReplaceSummary, SnapshotDb, SnapshotInfo } from '@/data';
import {
  eventsToIcs,
  icsFileName,
  icsToEnvelope,
  importCalendarId,
  importCalendarName,
} from '@/features/ics';
import type { IcsImportReport } from '@/features/ics';
import { parseIcs } from '@/core/ics';
import { MAX_BACKUP_BYTES, backupFileName, readBackupText } from './files';
import type { ReadFailure } from './files';

// Everything the "Data" screen does, as plain functions over the two databases (D-028). The
// screen only shows state and asks; these decide and write. Nothing here touches the DOM.

export type Mode = 'merge' | 'replace';

export type Source =
  | { readonly kind: 'file'; readonly name: string }
  | { readonly kind: 'snapshot'; readonly id: number; readonly createdAt: number };

/** What applying a file would do, for both modes, so the screen can switch between them. */
export interface Inspection {
  readonly source: Source;
  readonly envelope: Envelope;
  readonly merge: ImportPlan;
  readonly replace: ReplaceSummary;
  /** Set for an .ics file: it can only be merged (never replace), and these things were left out. */
  readonly ics?: { readonly calendarName: string; readonly report: IcsImportReport };
}

export type InspectOutcome =
  | { readonly ok: true; readonly inspection: Inspection }
  | {
      readonly ok: false;
      readonly failure: ReadFailure | 'snapshot-missing' | 'not-ics' | 'no-events';
    };

export interface Counts {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly same: number;
}

export interface Summary {
  readonly calendars: Counts;
  readonly events: Counts;
}

const mergeCounts = (p: MergePlan<unknown>): Counts => ({
  added: p.added.length,
  updated: p.updated.length,
  removed: p.deleted.length,
  same: p.same + p.older + p.tombstones.length,
});

const replaceCounts = (p: ReplacePlan<unknown>): Counts => ({
  added: p.added,
  updated: p.changed,
  removed: p.removed,
  same: p.same,
});

/** The numbers shown in the preview for a mode. */
export function summarize(inspection: Inspection, mode: Mode): Summary {
  return mode === 'merge'
    ? {
        calendars: mergeCounts(inspection.merge.calendars),
        events: mergeCounts(inspection.merge.events),
      }
    : {
        calendars: replaceCounts(inspection.replace.calendars),
        events: replaceCounts(inspection.replace.events),
      };
}

export interface Applied extends Summary {
  readonly mode: Mode;
  /** Events deleted because their calendar or series went away (not part of the preview). */
  readonly orphaned: number;
}

export interface FileToSave {
  readonly name: string;
  readonly text: string;
}

export interface DataToolsDeps {
  readonly db: NawyDb;
  readonly snapshotDb: SnapshotDb;
  readonly timeZone: TimeZoneId;
  readonly now?: () => number;
  /** Called when a backup file has been produced (the reminder's clock). */
  readonly onBackup?: (at: number) => void;
}

export interface DataTools {
  exportFile(): Promise<FileToSave>;
  /** The events as an .ics file. Not a backup: it does not reset the backup reminder. */
  exportIcs(): Promise<FileToSave>;
  inspectIcs(name: string, text: string, byteLength?: number): Promise<InspectOutcome>;
  inspectFile(name: string, text: string, byteLength?: number): Promise<InspectOutcome>;
  inspectSnapshot(id: number): Promise<InspectOutcome>;
  apply(inspection: Inspection, mode: Mode): Promise<Applied>;
  snapshots(): Promise<SnapshotInfo[]>;
  saveSnapshot(): Promise<SnapshotInfo>;
  snapshotFile(id: number): Promise<FileToSave | undefined>;
}

export function createDataTools(deps: DataToolsDeps): DataTools {
  const { db, snapshotDb, timeZone } = deps;
  const now = deps.now ?? nowMs;

  async function inspect(source: Source, envelope: Envelope): Promise<Inspection> {
    const [merge, replace] = await Promise.all([
      previewImport(db, envelope),
      previewReplace(db, envelope, now),
    ]);
    return { source, envelope, merge, replace };
  }

  return {
    async exportFile() {
      const at = now();
      const text = serializeEnvelope(await exportEnvelope(db, at), true);
      deps.onBackup?.(at);
      return { name: backupFileName(at, timeZone), text };
    },

    async exportIcs() {
      const at = now();
      const { calendars, events } = await exportEnvelope(db, at);
      return { name: icsFileName(at, timeZone), text: eventsToIcs(calendars, events) };
    },

    async inspectIcs(name, text, byteLength) {
      if ((byteLength ?? text.length) > MAX_BACKUP_BYTES) return { ok: false, failure: 'too-big' };
      // The receiving calendar's id: never one the person deleted, or the events would vanish.
      const calendarName = importCalendarName(parseIcs(text, { zone: timeZone }).name, name);
      let calendarId = importCalendarId(calendarName);
      for (let n = 2; (await db.calendars.get(calendarId))?.deletedAt !== undefined; n++) {
        calendarId = `${importCalendarId(calendarName)}-${n}`;
      }
      const result = icsToEnvelope(text, { fileName: name, zone: timeZone, now: now(), calendarId });
      if (!result.ok) return { ok: false, failure: result.failure };
      const inspection = await inspect({ kind: 'file', name }, result.envelope);
      return {
        ok: true,
        inspection: {
          ...inspection,
          ics: { calendarName: result.calendarName, report: result.report },
        },
      };
    },

    async inspectFile(name, text, byteLength) {
      const read = readBackupText(text, byteLength);
      if (!read.ok) return { ok: false, failure: read.failure };
      return { ok: true, inspection: await inspect({ kind: 'file', name }, read.envelope) };
    },

    async inspectSnapshot(id) {
      const parsed = await getSnapshotEnvelope(snapshotDb, id);
      if (parsed === undefined) return { ok: false, failure: 'snapshot-missing' };
      if (!parsed.ok) return { ok: false, failure: parsed.error.code };
      const info = (await listSnapshots(snapshotDb)).find((s) => s.id === id);
      return {
        ok: true,
        inspection: await inspect(
          { kind: 'snapshot', id, createdAt: info?.createdAt ?? parsed.value.exportedAt },
          parsed.value,
        ),
      };
    },

    async apply(inspection, requested) {
      // An .ics file only ever adds to what is here: "replace" would wipe the device (D-044).
      const mode: Mode = inspection.ics ? 'merge' : requested;
      const reason = inspection.source.kind === 'snapshot' ? 'before-restore' : 'before-import';
      if (mode === 'merge') {
        const r = await importWithSafetySnapshot(db, snapshotDb, inspection.envelope, now);
        return {
          mode,
          calendars: mergeCounts(r.calendars),
          events: mergeCounts(r.events),
          orphaned: r.orphanedEvents,
        };
      }
      const r = await replaceWithSafetySnapshot(db, snapshotDb, inspection.envelope, reason, now);
      return {
        mode,
        calendars: replaceCounts(r.calendars),
        events: replaceCounts(r.events),
        orphaned: r.orphanedEvents,
      };
    },

    snapshots: () => listSnapshots(snapshotDb),
    saveSnapshot: () => takeSnapshot(db, snapshotDb, 'manual', now),

    async snapshotFile(id) {
      const found = await getSnapshotJson(snapshotDb, id);
      if (!found) return undefined;
      return {
        name: backupFileName(found.createdAt, timeZone).replace(
          'nawy-today-',
          'nawy-today-snapshot-',
        ),
        text: found.json,
      };
    },
  };
}
