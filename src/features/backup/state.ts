// What the backup reminder needs to remember between visits (D-028): when the app was first
// used here, when a backup file was last made, and when the person last dismissed the reminder.
// Kept in localStorage like the settings: small, local, and a corrupt value only resets it.

export interface BackupState {
  readonly startedAt: number | undefined;
  readonly lastBackupAt: number | undefined;
  readonly lastRemindedAt: number | undefined;
}

export const BACKUP_STATE_KEY = 'nawy-today:backup:v1';

export const emptyBackupState: BackupState = {
  startedAt: undefined,
  lastBackupAt: undefined,
  lastRemindedAt: undefined,
};

const stamp = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;

export function parseBackupState(raw: unknown): BackupState {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    startedAt: stamp(o['startedAt']),
    lastBackupAt: stamp(o['lastBackupAt']),
    lastRemindedAt: stamp(o['lastRemindedAt']),
  };
}

export interface ReadableStorage {
  getItem(key: string): string | null;
}
export interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function loadBackupState(storage: ReadableStorage | undefined): BackupState {
  try {
    const text = storage?.getItem(BACKUP_STATE_KEY);
    return parseBackupState(text ? JSON.parse(text) : undefined);
  } catch {
    return emptyBackupState;
  }
}

/** `false` when the browser refuses (the reminder then simply may repeat; nothing breaks). */
export function saveBackupState(storage: WritableStorage | undefined, state: BackupState): boolean {
  try {
    storage?.setItem(BACKUP_STATE_KEY, JSON.stringify(state));
    return storage !== undefined;
  } catch {
    return false;
  }
}
