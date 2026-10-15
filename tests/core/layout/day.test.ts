import { describe, expect, it } from 'vitest';
import { blockPosition, clipToDay, nowPosition } from '@/core/layout';

describe('clipToDay', () => {
  it('returns the minutes of an event inside the day', () => {
    expect(clipToDay('2026-10-13T09:00', '2026-10-13T10:30', '2026-10-13')).toEqual({
      startMin: 540,
      endMin: 630,
    });
  });

  it('splits an event across midnight into one span per day', () => {
    const start = '2026-10-13T22:00';
    const end = '2026-10-14T02:00';
    expect(clipToDay(start, end, '2026-10-13')).toEqual({ startMin: 1320, endMin: 1440 });
    expect(clipToDay(start, end, '2026-10-14')).toEqual({ startMin: 0, endMin: 120 });
    expect(clipToDay(start, end, '2026-10-15')).toBeNull();
    expect(clipToDay(start, end, '2026-10-12')).toBeNull();
  });

  it('does not put an event ending exactly at midnight on the next day', () => {
    expect(clipToDay('2026-10-13T23:00', '2026-10-14T00:00', '2026-10-14')).toBeNull();
  });

  it('keeps zero-length events on their own day only', () => {
    expect(clipToDay('2026-10-13T09:00', '2026-10-13T09:00', '2026-10-13')).toEqual({
      startMin: 540,
      endMin: 540,
    });
    expect(clipToDay('2026-10-13T09:00', '2026-10-13T09:00', '2026-10-14')).toBeNull();
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(clipToDay('x', '2026-10-13T10:00', '2026-10-13')).toBeNull();
    expect(clipToDay('2026-10-13T09:00', '2026-10-13T10:00', '2026-02-30')).toBeNull();
  });
});

describe('blockPosition', () => {
  it('gives fractions of the day', () => {
    expect(blockPosition({ startMin: 360, endMin: 720 })).toEqual({ top: 0.25, height: 0.25 });
  });

  it('enforces a minimum height and keeps the block inside the day', () => {
    expect(blockPosition({ startMin: 600, endMin: 600 }, 30)).toEqual({
      top: 600 / 1440,
      height: 30 / 1440,
    });
    const late = blockPosition({ startMin: 1435, endMin: 1435 }, 30);
    expect(late.top + late.height).toBeLessThanOrEqual(1);
  });
});

describe('nowPosition', () => {
  it('is the fraction of the day on the same date and null otherwise', () => {
    expect(nowPosition('2026-10-13T12:00', '2026-10-13')).toBe(0.5);
    expect(nowPosition('2026-10-13T00:00', '2026-10-13')).toBe(0);
    expect(nowPosition('2026-10-13T12:00', '2026-10-14')).toBeNull();
  });
});
