import { describe, expect, it } from 'vitest';
import {
  BACKUP_STATE_KEY,
  backupFileName,
  failureMessageKey,
  loadBackupState,
  readBackupText,
  saveBackupState,
} from '@/features/backup';
import { MESSAGES } from '@/features/i18n';

describe('backupFileName', () => {
  it('uses the date on the person\'s own calendar, not UTC', () => {
    const lateUtc = Date.UTC(2026, 9, 18, 21, 30); // 00:30 on the 19th in Riyadh
    expect(backupFileName(lateUtc, 'Asia/Riyadh')).toBe('nawy-today-2026-10-19.json');
    expect(backupFileName(lateUtc, 'UTC')).toBe('nawy-today-2026-10-18.json');
  });
});

describe('readBackupText / failureMessageKey', () => {
  it('every failure has a message in both languages', () => {
    const failures = [
      'too-big', 'not-json', 'not-an-envelope', 'wrong-app', 'bad-version', 'newer-version',
      'no-migration', 'invalid-field', 'too-many-records', 'invalid-record', 'duplicate-id',
      'orphan-event',
    ] as const;
    for (const f of failures) {
      const key = failureMessageKey(f);
      expect(MESSAGES.ar[key], f).toBeTruthy();
      expect(MESSAGES.en[key], f).toBeTruthy();
    }
  });
  it('names an empty or foreign file instead of throwing', () => {
    expect(readBackupText('')).toEqual({ ok: false, failure: 'not-json' });
    expect(readBackupText('null')).toEqual({ ok: false, failure: 'not-an-envelope' });
  });
});

describe('backup state storage', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('round-trips', () => {
    const s = memory();
    saveBackupState(s, { startedAt: 1, lastBackupAt: 2, lastRemindedAt: undefined });
    expect(loadBackupState(s)).toEqual({ startedAt: 1, lastBackupAt: 2, lastRemindedAt: undefined });
  });
  it('a corrupt or foreign value resets each field on its own', () => {
    const s = memory();
    s.setItem(BACKUP_STATE_KEY, JSON.stringify({ startedAt: 'yesterday', lastBackupAt: 5, lastRemindedAt: -1 }));
    expect(loadBackupState(s)).toEqual({ startedAt: undefined, lastBackupAt: 5, lastRemindedAt: undefined });
    s.setItem(BACKUP_STATE_KEY, '{oops');
    expect(loadBackupState(s).lastBackupAt).toBeUndefined();
  });
  it('saving reports false when the browser refuses', () => {
    const refusing = { setItem: () => { throw new Error('quota'); } };
    expect(saveBackupState(refusing, { startedAt: 1, lastBackupAt: undefined, lastRemindedAt: undefined })).toBe(false);
    expect(saveBackupState(undefined, { startedAt: 1, lastBackupAt: undefined, lastRemindedAt: undefined })).toBe(false);
  });
});
