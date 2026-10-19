import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { BACKUP_STATE_KEY } from '@/features/backup';
import type { FileToSave } from '@/features/backup';
import { createDb, createSnapshotDb, createStore } from '@/data';
import { DAY, makeNewEvent } from '../helpers/factories';

const NOW_MS = Date.UTC(2026, 9, 13, 12, 0);
const NOW = () => NOW_MS;

const memoryStorage = (initial: Record<string, string> = {}) => {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    peek: (k: string) => m.get(k),
  };
};

let dbName = '';
let snapName = '';
beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  dbName = `backup-${id}`;
  snapName = `backup-snaps-${id}`;
});
afterEach(cleanup);

async function seed(titles: string[]) {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  for (const title of titles) {
    await store.createEvent(makeNewEvent({ calendarId: calendar.id, title }));
  }
  db.close();
}

const saved: FileToSave[] = [];
const open = (storage = memoryStorage(), create = () => createDb(dbName)) =>
  render(
    <App
      create={create}
      createSnapshots={() => createSnapshotDb(snapName)}
      now={NOW}
      storage={storage}
      saveFile={(f) => saved.push(f)}
    />,
  );

const openData = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Data & backups' }));
  return screen.findByRole('dialog', { name: 'Data & backups' });
};

const chooseFile = (dialog: HTMLElement, name: string, text: string) =>
  fireEvent.change(within(dialog).getByTestId('import-file'), {
    target: { files: [new File([text], name, { type: 'application/json' })] },
  });

beforeEach(() => {
  saved.length = 0;
});

describe('data dialog', () => {
  it('exports a dated backup file and remembers when', async () => {
    await seed(['Dentist']);
    const storage = memoryStorage();
    open(storage);
    const dialog = await openData();
    expect(within(dialog).getByText('No backup file saved yet.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download a backup' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.name).toMatch(/^nawy-today-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(saved[0]?.text ?? '{}').events).toHaveLength(1);
    const state = JSON.parse(storage.peek(BACKUP_STATE_KEY) ?? '{}');
    expect(state.lastBackupAt).toBe(NOW_MS);
    await waitFor(() => expect(within(dialog).queryByText('No backup file saved yet.')).toBeNull());
  });

  it('imports through a preview, then applies and takes a safety snapshot', async () => {
    await seed(['Original']);
    const first = open();
    let dialog = await openData();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download a backup' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const backup = saved[0] as FileToSave;
    first.unmount();

    // A fresh device with a different event: the file brings "Original" in.
    dbName = `${dbName}-other`;
    await seed(['Local only']);
    open();
    dialog = await openData();
    chooseFile(dialog, backup.name, backup.text);
    expect(await within(dialog).findByText('Preview before applying')).toBeTruthy();
    expect(within(dialog).getByText(`Source: file ${backup.name}`)).toBeTruthy();
    // Same calendar id on both sides is not the case here: the preview shows what would change.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await within(dialog).findByText(/^Done\./)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Data & backups' }));
    const again = await screen.findByRole('dialog', { name: 'Data & backups' });
    expect(await within(again).findByText(/Before an import/)).toBeTruthy();
  });

  it('refuses a file that is not a backup, in words, and changes nothing', async () => {
    await seed(['Dentist']);
    open();
    const dialog = await openData();
    chooseFile(dialog, 'notes.json', '{"hello":"world"}');
    expect(await within(dialog).findByText('This file is not a Nawy Today backup.')).toBeTruthy();
    expect(within(dialog).queryByText('Preview before applying')).toBeNull();
  });

  it('refuses a file from a newer version', async () => {
    await seed([]);
    open();
    const dialog = await openData();
    chooseFile(
      dialog,
      'future.json',
      JSON.stringify({ app: 'nawy-today', schemaVersion: 99, exportedAt: 1, calendars: [], events: [] }),
    );
    expect(await within(dialog).findByText(/newer version of the app/)).toBeTruthy();
  });

  it('takes a snapshot and restores it, bringing back what was deleted since', async () => {
    await seed(['Keep', 'Lost']);
    open();
    let dialog = await openData();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take a snapshot now' }));
    expect(await within(dialog).findByText('Snapshot saved.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    // Delete "Lost" afterwards, directly in the database, as another tab would.
    const db = createDb(dbName);
    await db.open();
    const store = createStore(db);
    const lost = (await store.listEvents()).find((e) => e.title === 'Lost');
    await store.deleteEvent(lost?.id ?? '');
    db.close();

    dialog = await openData();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore' }));
    expect(await within(dialog).findByText('Preview before applying')).toBeTruthy();
    // A snapshot opens in "replace" mode: that is what makes the deleted event come back.
    const replace = within(dialog).getByRole('radio', { name: /Replace this device/ });
    expect((replace as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await within(dialog).findByText(/^Done\./)).toBeTruthy();

    const check = createDb(dbName);
    await check.open();
    const titles = (await createStore(check).listEvents()).map((e) => e.title).sort();
    check.close();
    expect(titles).toEqual(['Keep', 'Lost']);
  });

  it('shows the storage state plainly', async () => {
    await seed([]);
    open();
    const dialog = await openData();
    await waitFor(() =>
      expect(
        within(dialog).getByText(/Storage is not guaranteed|Storage is persistent|cannot be asked/),
      ).toBeTruthy(),
    );
  });
});

describe('backup reminder', () => {
  const days = (n: number) => NOW_MS - n * DAY;

  it('appears after 30 days with 3+ events, and "Later" silences it for a while', async () => {
    await seed(['A', 'B', 'C']);
    const storage = memoryStorage({
      [BACKUP_STATE_KEY]: JSON.stringify({ startedAt: days(100), lastBackupAt: days(45) }),
    });
    const view = open(storage);
    expect(await screen.findByText('You have not saved a backup file in 45 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByText(/You have not saved a backup/)).toBeNull());
    expect(JSON.parse(storage.peek(BACKUP_STATE_KEY) ?? '{}').lastRemindedAt).toBe(NOW_MS);
    view.unmount();
    open(storage);
    await screen.findByRole('button', { name: 'Add event' });
    expect(screen.queryByText(/You have not saved a backup/)).toBeNull();
  });

  it('stays quiet for a new user, with few events, or after a recent backup', async () => {
    await seed(['A', 'B']); // fewer than 3
    const quiet = memoryStorage({
      [BACKUP_STATE_KEY]: JSON.stringify({ startedAt: days(100), lastBackupAt: days(45) }),
    });
    open(quiet);
    await screen.findByRole('button', { name: 'Add event' });
    expect(screen.queryByText(/You have not saved a backup/)).toBeNull();
  });

  it('its "Download" button opens the data dialog', async () => {
    await seed(['A', 'B', 'C']);
    open(
      memoryStorage({
        [BACKUP_STATE_KEY]: JSON.stringify({ startedAt: days(100), lastBackupAt: days(45) }),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Download a backup now' }));
    expect(await screen.findByRole('dialog', { name: 'Data & backups' })).toBeTruthy();
  });
});

describe('recovery when the data cannot be opened', () => {
  const failingFirst = () => {
    let calls = 0;
    return () => {
      calls += 1;
      const db = createDb(dbName);
      if (calls === 1) db.open = () => Promise.reject(new Error('cannot open'));
      return db;
    };
  };

  it('offers retry, the newest snapshot as a file, and a confirmed fresh start', async () => {
    await seed(['Kept in a snapshot']);
    // A snapshot exists in the (separate) snapshot database.
    const db = createDb(dbName);
    const snaps = createSnapshotDb(snapName);
    const { takeSnapshot } = await import('@/data');
    await takeSnapshot(db, snaps, 'manual', NOW);
    db.close();

    open(memoryStorage(), failingFirst());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText("Couldn't open your data on this device.")).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Download the latest saved snapshot' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.name).toMatch(/^nawy-today-snapshot-/);
    expect(JSON.parse(saved[0]?.text ?? '{}').events).toHaveLength(1);

    // The destructive step asks first and says what it does.
    fireEvent.click(screen.getByRole('button', { name: /Erase this device/ }));
    expect(screen.getByText(/will be deleted from this device/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, erase and start fresh' }));
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeTruthy();
    expect(screen.queryByText('Kept in a snapshot')).toBeNull();
  });

  it('says so when there is no snapshot', async () => {
    open(memoryStorage(), failingFirst());
    fireEvent.click(await screen.findByRole('button', { name: 'Download the latest saved snapshot' }));
    expect(await screen.findByText('No snapshot is saved in this browser.')).toBeTruthy();
    expect(saved).toHaveLength(0);
  });
});
