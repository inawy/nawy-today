import { useCallback, useEffect, useState } from 'react';
import { daysSinceBackup, shouldRemindBackup, shouldWarnStorage } from '@/core/backup';
import { loadBackupState, saveBackupState } from './state';
import type { BackupState, ReadableStorage, WritableStorage } from './state';

export interface BackupReminder {
  readonly show: boolean;
  /** When a backup file was last made, if ever. */
  readonly lastBackupAt: number | undefined;
  /** Days since the last backup file (or since first use), for the banner text. */
  readonly days: number;
  /** A backup file was just produced. */
  readonly markBackedUp: (at: number) => void;
  /** "Later": do not show again for a while. */
  readonly dismiss: () => void;
  /** The browser refused durable storage and nothing protects the data yet (D-057). */
  readonly storageWarning: boolean;
  readonly dismissStorageWarning: () => void;
}

export interface BackupReminderOptions {
  readonly storage: (ReadableStorage & WritableStorage) | undefined;
  readonly now: () => number;
  /** Live events in the data (the reminder stays quiet until there is something to lose). */
  readonly eventCount: number;
  /** False while the data is still loading or has failed. */
  readonly enabled: boolean;
  /** The browser's answer to the durable-storage request. */
  readonly persistence?: 'granted' | 'denied' | 'unsupported' | 'pending' | undefined;
}

export function useBackupReminder({
  storage,
  now,
  eventCount,
  enabled,
  persistence = 'pending',
}: BackupReminderOptions): BackupReminder {
  const [state, setState] = useState<BackupState>(() => loadBackupState(storage));

  // The clock for "never backed up" starts the first time the app is used on this device.
  useEffect(() => {
    if (state.startedAt !== undefined) return;
    const next = { ...state, startedAt: now() };
    setState(next);
    saveBackupState(storage, next);
  }, [state, storage, now]);

  const update = useCallback(
    (patch: Partial<BackupState>) => {
      setState((current) => {
        const next = { ...current, ...patch };
        saveBackupState(storage, next);
        return next;
      });
    },
    [storage],
  );

  const markBackedUp = useCallback((at: number) => update({ lastBackupAt: at }), [update]);
  const dismiss = useCallback(() => update({ lastRemindedAt: now() }), [update, now]);
  const dismissStorageWarning = useCallback(() => update({ lastWarnedAt: now() }), [update, now]);

  const input = {
    now: now(),
    startedAt: state.startedAt ?? now(),
    lastBackupAt: state.lastBackupAt,
    lastRemindedAt: state.lastRemindedAt,
    eventCount,
  };
  return {
    show: enabled && shouldRemindBackup(input),
    lastBackupAt: state.lastBackupAt,
    days: daysSinceBackup(input),
    markBackedUp,
    dismiss,
    storageWarning:
      enabled &&
      shouldWarnStorage({
        now: now(),
        persistence,
        lastBackupAt: state.lastBackupAt,
        lastWarnedAt: state.lastWarnedAt,
        eventCount,
      }),
    dismissStorageWarning,
  };
}
