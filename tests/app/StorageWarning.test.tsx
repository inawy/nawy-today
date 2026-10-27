import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createSnapshotDb, createStore } from '@/data';
import { BACKUP_STATE_KEY } from '@/features/backup';
import { makeNewEvent } from '../helpers/factories';

const NOW_MS = Date.UTC(2026, 9, 13, 12, 0);

let dbName = '';
beforeEach(() => {
  dbName = `warn-${Math.random().toString(36).slice(2)}`;
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'storage');
});

const browserSays = (granted: boolean) =>
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: async () => granted, persisted: async () => false },
  });

const memoryStorage = (initial: Record<string, string> = {}) => {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    peek: (k: string) => m.get(k),
  };
};

async function seed(count: number) {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  for (let i = 0; i < count; i++) {
    await store.createEvent(makeNewEvent({ calendarId: calendar.id, title: `E${i}` }));
  }
  db.close();
}

const open = (storage = memoryStorage()) =>
  render(
    <App
      create={() => createDb(dbName)}
      createSnapshots={() => createSnapshotDb(`${dbName}-snaps`)}
      now={() => NOW_MS}
      storage={storage}
    />,
  );

const WARNING = /has not promised to keep your data/;

describe('the early notice that storage is not guaranteed (D-057)', () => {
  it('appears when the browser refused, and "Got it" silences it for a while', async () => {
    browserSays(false);
    await seed(3);
    const storage = memoryStorage();
    const view = open(storage);
    expect(await screen.findByText(WARNING)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText(WARNING)).toBeNull());
    expect(JSON.parse(storage.peek(BACKUP_STATE_KEY) ?? '{}').lastWarnedAt).toBe(NOW_MS);
    view.unmount();
    open(storage);
    await screen.findByRole('button', { name: 'Add event' });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('its download button opens the data dialog', async () => {
    browserSays(false);
    await seed(3);
    open();
    await screen.findByText(WARNING);
    fireEvent.click(screen.getByRole('button', { name: 'Download a backup now' }));
    expect(await screen.findByRole('dialog', { name: 'Data & backups' })).toBeTruthy();
  });

  it('stays quiet when the browser agreed, or there is little to lose', async () => {
    browserSays(true);
    await seed(3);
    const view = open();
    await screen.findByRole('button', { name: 'Add event' });
    expect(screen.queryByText(WARNING)).toBeNull();
    view.unmount();

    browserSays(false);
    dbName = `${dbName}-few`;
    await seed(1);
    open();
    await screen.findByRole('button', { name: 'Add event' });
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});
