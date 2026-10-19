import { describe, expect, it } from 'vitest';
import { planReplace, tombstoneEvent, type CalEvent } from '@/core/model';
import { makeEvent } from '../helpers/factories';

const NOW = 2_000_000_000_000;
const byId = (...events: CalEvent[]) => new Map(events.map((e) => [e.id, e]));
const plan = (local: CalEvent[], incoming: CalEvent[]) =>
  planReplace(byId(...local), incoming, tombstoneEvent, NOW);

describe('planReplace', () => {
  it('brings back what was deleted after the file was made (merge cannot)', () => {
    const inFile = makeEvent({ id: 'a', title: 'Dentist' });
    const deletedLocally = tombstoneEvent(inFile, NOW - 1000);
    const p = plan([deletedLocally], [inFile]);
    expect(p.added).toBe(1);
    expect(p.write).toHaveLength(1);
    expect(p.write[0]?.title).toBe('Dentist');
    expect(p.write[0]?.deletedAt).toBeUndefined();
    expect(p.write[0]?.updatedAt).toBeGreaterThan(deletedLocally.updatedAt);
  });

  it('reverts a later edit and writes a newer version, not the old stamp', () => {
    const inFile = makeEvent({ id: 'a', title: 'Old', updatedAt: 100 });
    const local = makeEvent({ id: 'a', title: 'Edited', updatedAt: NOW + 5 });
    const p = plan([local], [inFile]);
    expect(p.changed).toBe(1);
    expect(p.write[0]?.title).toBe('Old');
    expect(p.write[0]?.updatedAt).toBe(NOW + 6);
  });

  it('deletes (tombstones) what the file does not have, and counts it', () => {
    const p = plan([makeEvent({ id: 'only-here' })], []);
    expect(p.removed).toBe(1);
    expect(p.write[0]?.deletedAt).toBeDefined();
    expect(p.write[0]?.title).toBe('');
  });

  it('deletes a live event the file has as a tombstone', () => {
    const live = makeEvent({ id: 'a' });
    const p = plan([live], [tombstoneEvent(live, 5000)]);
    expect(p.removed).toBe(1);
    expect(p.write[0]?.deletedAt).toBeDefined();
  });

  it('writes nothing for identical records, whatever their stamps', () => {
    const a = makeEvent({ id: 'a', updatedAt: 1 });
    const same = makeEvent({ id: 'a', updatedAt: 999 });
    const p = plan([same], [a]);
    expect(p).toEqual({ write: [], added: 0, changed: 0, removed: 0, same: 1 });
  });

  it('keeps an unknown tombstone from the file so an older file cannot revive it later', () => {
    const t = tombstoneEvent(makeEvent({ id: 'ghost' }), 5000);
    const p = plan([], [t]);
    expect(p.write).toEqual([t]);
    expect(p.added + p.removed + p.changed).toBe(0);
  });

  it('is idempotent: applying its own result and planning again does nothing', () => {
    const file = [makeEvent({ id: 'a', title: 'A' }), makeEvent({ id: 'b', title: 'B' })];
    const local = [makeEvent({ id: 'a', title: 'changed' }), makeEvent({ id: 'c' })];
    const first = plan(local, file);
    const after = new Map(local.map((e) => [e.id, e]));
    for (const w of first.write) after.set(w.id, w);
    const second = planReplace(after, file, tombstoneEvent, NOW + 10);
    expect(second.write.filter((w) => w.deletedAt === undefined)).toEqual([]);
    expect(second.added + second.changed + second.removed).toBe(0);
  });
});
