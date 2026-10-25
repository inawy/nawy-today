import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createSnapshotDb } from '@/data';

let dbName = '';
let snapName = '';
beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  dbName = `sc-${id}`;
  snapName = `sc-snaps-${id}`;
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

describe('keyboard shortcuts help', () => {
  it('opens with Shift + slash, lists the keys, and closes with Escape', async () => {
    open();
    await screen.findByRole('button', { name: 'Add event' });
    fireEvent.keyDown(window, { code: 'Slash', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Move the selected event 15 minutes (reach it with Tab)')).toBeTruthy();
    expect(within(dialog).getAllByText('Shift').length).toBeGreaterThan(0);
    // Shortcuts pause while it is open: "C" must not start a new event.
    fireEvent.keyDown(window, { code: 'KeyC' });
    expect(screen.queryByRole('dialog', { name: 'New event' })).toBeNull();
    fireEvent.keyDown(dialog, { code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('is also reachable from the menu', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });
});
