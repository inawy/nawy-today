import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createSnapshotDb } from '@/data';

let dbName = '';
let snapName = '';
beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  dbName = `ab-${id}`;
  snapName = `ab-snaps-${id}`;
});
afterEach(cleanup);

const open = () =>
  render(
    <App
      create={() => createDb(dbName)}
      createSnapshots={() => createSnapshotDb(snapName)}
      now={() => Date.UTC(2026, 9, 13, 12, 0)}
      storage={{ getItem: () => null, setItem: () => undefined }}
    />,
  );

describe('about and privacy', () => {
  it('opens from the menu, says plainly what it cannot do, and closes with Escape', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'About and privacy' }));
    const dialog = await screen.findByRole('dialog', { name: 'About Nawy Today' });
    expect(within(dialog).getByText(/No reminders and no notifications/)).toBeTruthy();
    expect(within(dialog).getByText(/we have no copy to give back/)).toBeTruthy();
    // Shortcuts pause while it is open: "C" must not start a new event.
    fireEvent.keyDown(window, { code: 'KeyC' });
    expect(screen.queryByRole('dialog', { name: 'New event' })).toBeNull();
    fireEvent.keyDown(dialog, { code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'About Nawy Today' })).toBeNull();
  });
});
