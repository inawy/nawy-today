import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import type { FileToSave } from '@/features/backup';
import { createDb, createSnapshotDb, createStore } from '@/data';
import { makeNewEvent } from '../helpers/factories';

const NOW_MS = Date.UTC(2026, 9, 13, 12, 0);
const storage = () => ({ getItem: () => null, setItem: () => undefined });

let dbName = '';
let snapName = '';
beforeEach(() => {
  const id = Math.random().toString(36).slice(2);
  dbName = `ics-${id}`;
  snapName = `ics-snaps-${id}`;
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
const open = () =>
  render(
    <App
      create={() => createDb(dbName)}
      createSnapshots={() => createSnapshotDb(snapName)}
      now={() => NOW_MS}
      storage={storage()}
      saveFile={(f) => saved.push(f)}
    />,
  );

const openData = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Data & backups' }));
  return screen.findByRole('dialog', { name: 'Data & backups' });
};

beforeEach(() => {
  saved.length = 0;
});

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:Holidays',
  'BEGIN:VEVENT',
  'UID:h1',
  'DTSTART;VALUE=DATE:20261013',
  'SUMMARY:National Day',
  'BEGIN:VALARM',
  'TRIGGER:-PT10M',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('ICS in the data dialog', () => {
  it('exports the events as a dated .ics file that does not count as a backup', async () => {
    await seed(['Dentist']);
    open();
    const dialog = await openData();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export ICS' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.name).toMatch(/^nawy-today-\d{4}-\d{2}-\d{2}\.ics$/);
    expect(saved[0]?.text).toContain('SUMMARY:Dentist');
    expect(saved[0]?.text).not.toContain('VALARM');
    expect(within(dialog).getByText('No backup file saved yet.')).toBeTruthy();
  });

  it('previews an .ics file, says what it leaves out, and adds it as a new calendar', async () => {
    await seed(['Local']);
    open();
    const dialog = await openData();
    fireEvent.change(within(dialog).getByTestId('import-ics'), {
      target: { files: [new File([ICS], 'holidays.ics', { type: 'text/calendar' })] },
    });
    expect(await within(dialog).findByText('Preview before applying')).toBeTruthy();
    expect(within(dialog).getByText(/new calendar named "Holidays"/)).toBeTruthy();
    expect(within(dialog).getByText('1 alarm(s) (this app does not remind)')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await within(dialog).findByText(/^Done\./)).toBeTruthy();
  });

  it('refuses a file that is not a calendar, in words', async () => {
    await seed([]);
    open();
    const dialog = await openData();
    fireEvent.change(within(dialog).getByTestId('import-ics'), {
      target: { files: [new File(['just text'], 'x.ics')] },
    });
    expect(await within(dialog).findByText('That is not a valid ICS calendar file.')).toBeTruthy();
  });
});
