// When to nudge the person to save a backup file (D-008, D-028). Pure: the caller keeps the
// dates. Honest about what it is: an in-app banner shown when the app is opened, never a
// notification (D-002). Snapshots do not count as a backup: they live in the same browser
// storage as the data, so only a downloaded file resets the clock.

export const REMIND_AFTER_DAYS = 30;
export const REMIND_AGAIN_AFTER_DAYS = 14;
export const MIN_EVENTS_TO_REMIND = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderInput {
  readonly now: number;
  /** When the person first used the app on this device (the clock for "never backed up"). */
  readonly startedAt: number;
  readonly lastBackupAt: number | undefined;
  readonly lastRemindedAt: number | undefined;
  /** Live events (not tombstones). */
  readonly eventCount: number;
}

export function shouldRemindBackup(input: ReminderInput): boolean {
  if (input.eventCount < MIN_EVENTS_TO_REMIND) return false;
  const since = input.lastBackupAt ?? input.startedAt;
  if (input.now - since < REMIND_AFTER_DAYS * DAY_MS) return false;
  if (
    input.lastRemindedAt !== undefined &&
    input.now - input.lastRemindedAt < REMIND_AGAIN_AFTER_DAYS * DAY_MS
  ) {
    return false;
  }
  return true;
}

/** Whole days since the last backup (or since first use), for the banner text. */
export function daysSinceBackup(input: ReminderInput): number {
  const since = input.lastBackupAt ?? input.startedAt;
  return Math.max(0, Math.floor((input.now - since) / DAY_MS));
}
