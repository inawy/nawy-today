import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addEvent(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

async function openData(page: Page) {
  await page.getByRole('button', { name: 'Data & backups' }).click();
  const dialog = page.getByRole('dialog', { name: 'Data & backups' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const eventButton = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(title) }).first();

test.describe('backup file, in a real browser', () => {
  test('download, lose the event, import the file in replace mode: it comes back', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await addEvent(page, 'Precious');

    let dialog = await openData(page);
    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download a backup' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^nawy-today-\d{4}-\d{2}-\d{2}\.json$/);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { app: string; events: unknown[] };
    expect(parsed.app).toBe('nawy-today');
    expect(parsed.events).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Close' }).click();

    // Delete it through the UI.
    await eventButton(page, 'Precious').click();
    await page
      .getByRole('dialog', { name: 'Precious' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('button', { name: /Precious/ })).toHaveCount(0);

    dialog = await openData(page);
    await dialog.getByTestId('import-file').setInputFiles(file);
    await expect(dialog.getByText('Preview before applying')).toBeVisible();
    // Merge would keep the newer deletion; replace is what brings the event back.
    await dialog.getByRole('radio', { name: /Replace this device/ }).check();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog.getByText(/^Done\./)).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(eventButton(page, 'Precious')).toBeVisible();

    await page.reload();
    await expect(eventButton(page, 'Precious')).toBeVisible();
  });

  test('a file that is not a backup is refused and nothing changes', async ({ page }, testInfo) => {
    await page.goto('/');
    await addEvent(page, 'Safe');
    const bad = testInfo.outputPath('bad.json');
    await import('node:fs/promises').then((fs) => fs.writeFile(bad, '{"hello":"world"}'));
    const dialog = await openData(page);
    await dialog.getByTestId('import-file').setInputFiles(bad);
    await expect(dialog.getByText('This file is not a Nawy Today backup.')).toBeVisible();
    await expect(dialog.getByText('Preview before applying')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(eventButton(page, 'Safe')).toBeVisible();
  });
});

test.describe('a database that cannot be opened (simulated corruption)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const real = indexedDB.open.bind(indexedDB);
      indexedDB.open = ((name: string, version?: number) => {
        if (name !== 'nawy-today' || localStorage.getItem('e2e-break-db') !== '1') {
          return real(name, version);
        }
        const request = {
          error: new DOMException('simulated failure', 'UnknownError'),
          result: undefined,
          onerror: null as ((e: unknown) => void) | null,
        };
        setTimeout(() => {
          request.onerror?.({
            target: request,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
          });
        }, 0);
        return request as unknown as IDBOpenDBRequest;
      }) as typeof indexedDB.open;
    });
  });

  test('recovery screen, snapshot kept, fresh start, then restore from the snapshot', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await addEvent(page, 'Survives in a snapshot');
    const dialog = await openData(page);
    await dialog.getByRole('button', { name: 'Take a snapshot now' }).click();
    await expect(dialog.getByText('Snapshot saved.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // Make opening the main database fail, the way a corrupt file or blocked storage would for the
    // app: `indexedDB.open('nawy-today')` errors while the flag is set. (Real corruption cannot be
    // produced from a test; this exercises the app's whole reaction to an open() that rejects.)
    await page.evaluate(() => localStorage.setItem('e2e-break-db', '1'));

    await page.reload();
    await expect(page.getByRole('alert')).toContainText("Couldn't open your data on this device.");
    await expect(page.getByRole('button', { name: 'Add event' })).toHaveCount(0);

    // The snapshot is a separate database: it is still readable, and can be saved as a file.
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the latest saved snapshot' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^nawy-today-snapshot-/);
    const file = testInfo.outputPath('snapshot.json');
    await download.saveAs(file);
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ app: 'nawy-today' });

    // Erasing asks first and says what it does. (The fault is lifted first: after a real erase
    // the browser opens a fresh file; the flag stands in for "the broken file is gone".)
    await page.evaluate(() => localStorage.removeItem('e2e-break-db'));
    await page.getByRole('button', { name: /Erase this device/ }).click();
    await expect(page.getByText(/will be deleted from this device/)).toBeVisible();
    await page.getByRole('button', { name: 'Yes, erase and start fresh' }).click();
    await expect(page.getByRole('button', { name: 'Add event' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Survives in a snapshot/ })).toHaveCount(0);

    // Restore the snapshot into the fresh database.
    const data = await openData(page);
    await data.getByRole('button', { name: 'Restore' }).first().click();
    await expect(data.getByText('Preview before applying')).toBeVisible();
    await data.getByRole('button', { name: 'Apply' }).click();
    await expect(data.getByText(/^Done\./)).toBeVisible();
    await data.getByRole('button', { name: 'Close' }).click();
    await expect(eventButton(page, 'Survives in a snapshot')).toBeVisible();

    await page.reload();
    await expect(eventButton(page, 'Survives in a snapshot')).toBeVisible();
  });
});
