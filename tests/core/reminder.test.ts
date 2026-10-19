import { describe, expect, it } from 'vitest';
import { daysSinceBackup, shouldRemindBackup, type ReminderInput } from '@/core/backup';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19);
const base: ReminderInput = {
  now: NOW,
  startedAt: NOW - 100 * DAY,
  lastBackupAt: NOW - 31 * DAY,
  lastRemindedAt: undefined,
  eventCount: 5,
};

describe('shouldRemindBackup', () => {
  it('reminds after 30 days without a backup', () => {
    expect(shouldRemindBackup(base)).toBe(true);
  });
  it('does not remind at 29 days, does at exactly 30', () => {
    expect(shouldRemindBackup({ ...base, lastBackupAt: NOW - 29 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, lastBackupAt: NOW - 30 * DAY })).toBe(true);
  });
  it('does not remind with fewer than 3 events (nothing worth losing yet)', () => {
    expect(shouldRemindBackup({ ...base, eventCount: 2 })).toBe(false);
    expect(shouldRemindBackup({ ...base, eventCount: 3 })).toBe(true);
  });
  it('never backed up: counts from first use', () => {
    const never = { ...base, lastBackupAt: undefined };
    expect(shouldRemindBackup({ ...never, startedAt: NOW - 10 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...never, startedAt: NOW - 40 * DAY })).toBe(true);
  });
  it('at most once per 14 days after being dismissed', () => {
    expect(shouldRemindBackup({ ...base, lastRemindedAt: NOW - 13 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, lastRemindedAt: NOW - 14 * DAY })).toBe(true);
  });
  it('a fresh backup silences it', () => {
    expect(shouldRemindBackup({ ...base, lastBackupAt: NOW - DAY })).toBe(false);
  });
});

describe('daysSinceBackup', () => {
  it('counts whole days, from first use when never backed up', () => {
    expect(daysSinceBackup(base)).toBe(31);
    expect(daysSinceBackup({ ...base, lastBackupAt: undefined })).toBe(100);
    expect(daysSinceBackup({ ...base, lastBackupAt: NOW + DAY })).toBe(0);
  });
});
