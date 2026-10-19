// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDb, resetDatabase } from '@/data';

describe('resetDatabase', () => {
  it('removes the database so the next open is empty', async () => {
    const name = `reset-${Math.random().toString(36).slice(2)}`;
    const db = createDb(name);
    await db.calendars.add({
      id: 'c',
      name: 'x',
      color: 'blue',
      visible: true,
      createdAt: 1,
      updatedAt: 1,
    });
    db.close();
    expect(await resetDatabase(name)).toBe(true);
    const again = createDb(name);
    expect(await again.calendars.count()).toBe(0);
    again.close();
  });
});
