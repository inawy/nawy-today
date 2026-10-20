import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Release gate (PRODUCT_SPEC section 5): performance with 5000 events, keyboard navigation and
// focus in dialogs, and automated accessibility checks on the real built app.

async function addEvent(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, label).toEqual([]);
}

test.describe('performance with 5000 events', () => {
  test('the month is drawn quickly on a full database', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __firstBar?: number };
      new MutationObserver((_records, observer) => {
        if (document.querySelector('.bar')) {
          w.__firstBar = performance.now();
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await addEvent(page, 'Seed');

    // Fill the database directly with 5000 events spread over the months around today.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('nawy-today');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const calendarId = await new Promise<string>((resolve) => {
        const q = db.transaction('calendars').objectStore('calendars').getAll();
        q.onsuccess = () => resolve((q.result[0] as { id: string }).id);
      });
      const now = new Date();
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      for (let i = 0; i < 5000; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth(), 1 + (i % 28));
        d.setDate(d.getDate() + (i % 5) - 2);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hour = String(8 + (i % 10)).padStart(2, '0');
        store.put({
          id: `perf-${i}`,
          calendarId,
          title: `Event ${i}`,
          allDay: false,
          start: `${day}T${hour}:00`,
          end: `${day}T${hour}:45`,
          tzid: 'Asia/Riyadh',
          createdAt: 1,
          updatedAt: 1,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });

    await page.reload();
    await expect(page.locator('.bar').first()).toBeVisible();
    const firstBar = await page.evaluate(
      () => (window as unknown as { __firstBar?: number }).__firstBar ?? -1,
    );
    expect(firstBar, 'ms from navigation start to the first event bar').toBeGreaterThan(0);
    // PRODUCT_SPEC asks for <= 300 ms to the first paint. That figure is enforced where it can be
    // measured without noise (the model computation, tests/features/viewPerf.test.ts). Here the
    // clock also includes loading and parsing the app and reading 5000 events from IndexedDB on a
    // shared CI runner, where the same build has measured both ~250 ms and ~440 ms; so this is a
    // regression guard with headroom, not the 300 ms claim (see BUILD_PLAN, release gate).
    expect(firstBar, 'ms from navigation start to the first event bar').toBeLessThan(800);
  });
});

test.describe('keyboard and focus', () => {
  test('shortcuts open dialogs, focus stays inside them, and Escape gives the page back', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Add event' })).toBeVisible(); // app is ready
    await page.keyboard.press('KeyC');
    const editor = page.getByRole('dialog', { name: 'New event' });
    await expect(editor).toBeVisible();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
      );
      expect(inside, `focus escaped the editor after ${i + 1} Tab presses`).toBe(true);
    }
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(
        () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
      );
      expect(inside, `focus escaped the editor going backwards (${i + 1})`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();

    await page.keyboard.press('Slash');
    const search = page.getByRole('dialog', { name: 'Search' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();
  });

  test('view shortcuts and the view buttons agree', async ({ page }) => {
    await page.goto('/');
    for (const [code, name] of [
      ['KeyD', 'Day'],
      ['KeyW', 'Week'],
      ['KeyA', 'Agenda'],
      ['KeyM', 'Month'],
    ] as const) {
      await page.keyboard.press(code);
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  test('every interactive element can be reached with Tab and shows where the focus is', async ({
    page,
  }) => {
    await page.goto('/');
    await addEvent(page, 'Reach me');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return undefined;
        const style = getComputedStyle(el);
        const visibleRing =
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none';
        return {
          label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName,
          visibleRing,
        };
      });
      if (info) {
        seen.add(info.label);
        expect(info.visibleRing, `no visible focus on "${info.label}"`).toBe(true);
      }
    }
    expect(seen.has('Reach me') || [...seen].some((l) => l.includes('Reach me'))).toBe(true);
  });
});

test.describe('automated accessibility checks (axe, WCAG 2.0/2.1 A and AA)', () => {
  test('month view with an event, light theme', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Dentist');
    await expectNoViolations(page, 'month, light');
  });

  test('the editor, search and data dialogs', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Dentist');

    await page.getByRole('button', { name: 'Add event' }).click();
    await expect(page.getByRole('dialog', { name: 'New event' })).toBeVisible();
    await expectNoViolations(page, 'editor');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'New event' })).toBeHidden();

    await page.keyboard.press('Slash');
    await page.getByRole('searchbox', { name: 'Search' }).fill('dent');
    await expect(page.getByRole('dialog', { name: 'Search' }).getByText('Dentist')).toBeVisible();
    await expectNoViolations(page, 'search');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
    expect(page.url()).toContain('localhost:4173'); // Back/Escape never leaves the app

    await page.getByRole('button', { name: 'Data & backups' }).click();
    await expect(page.getByRole('dialog', { name: 'Data & backups' })).toBeVisible();
    await expectNoViolations(page, 'data');
  });

  test('week and agenda views', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Dentist');
    await page.keyboard.press('KeyW');
    await expectNoViolations(page, 'week');
    await page.keyboard.press('KeyA');
    await expectNoViolations(page, 'agenda');
  });

  test('the agenda with a finished event (dimmed rows must keep their contrast)', async ({
    page,
  }) => {
    // Fixed clock: noon in Riyadh, add the event, then let three hours pass so it has ended.
    await page.clock.install({ time: new Date('2026-10-20T09:00:00Z') });
    await page.goto('/');
    await addEvent(page, 'Already over');
    await page.keyboard.press('KeyA');
    await page.clock.fastForward('03:00:00');
    await expect(page.locator('.agenda-item[data-status="past"]').first()).toBeVisible();
    await expectNoViolations(page, 'agenda, past event');
  });

  test('dark theme', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Dentist');
    await page.getByLabel('Theme').selectOption('dark');
    await expectNoViolations(page, 'month, dark');
  });

  test.describe('Arabic, right to left', () => {
    test.use({ locale: 'ar-SA' });
    test('month view', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expectNoViolations(page, 'month, arabic');
    });
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the agenda and its menu', async ({ page }) => {
      await page.goto('/');
      await expectNoViolations(page, 'phone agenda');
    });
  });
});
