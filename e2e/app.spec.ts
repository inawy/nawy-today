import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function addEvent(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('the whole cycle in a real browser', () => {
  test('an event created through the UI is still there after a reload', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Dentist');
    await expect(page.getByRole('button', { name: /Dentist/ }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Dentist/ }).first()).toBeVisible();
  });

  test('dragging a block in the day view moves it, and undo puts it back', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Drag me');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    const block = page.locator('.block', { hasText: 'Drag me' });
    await expect(block.locator('.block-time')).toContainText('9:00');
    await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = await block.boundingBox();
    if (!box) throw new Error('the block has no box');
    const x = box.x + box.width / 2;
    const y = box.y + 10;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 48, { steps: 6 });
    await page.mouse.move(x, y + 96, { steps: 6 });
    await page.mouse.up();
    await expect(block.locator('.block-time')).toContainText('11:00');
    // Dropping is not a click: the card must not open.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(block.locator('.block-time')).toContainText('9:00');
  });

  test('dragging the bottom edge changes the length only, and undo puts it back', async ({
    page,
  }) => {
    await page.goto('/');
    await addEvent(page, 'Stretch me');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    const block = page.locator('.block', { hasText: 'Stretch me' });
    await expect(block.locator('.block-time')).toContainText(/9:00.*10:00/);
    await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const handle = await block.locator('.block-resize').boundingBox();
    if (!handle) throw new Error('the block has no resize edge');
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 24, { steps: 6 });
    await page.mouse.move(x, y + 48, { steps: 6 });
    await page.mouse.up();
    await expect(block.locator('.block-time')).toContainText(/9:00.*11:00/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(block.locator('.block-time')).toContainText(/9:00.*10:00/);
  });

  test('dragging an all-day item moves it by whole days, and undo puts it back', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add event' }).click();
    const dialog = page.getByRole('dialog', { name: 'New event' });
    await dialog.getByLabel('Title').fill('Holiday');
    await dialog.getByLabel('All day').check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    const bar = page.locator('.tg-allday .bar', { hasText: 'Holiday' });
    const column = async () =>
      Number(((await bar.evaluate((el) => el.style.gridColumn)) ?? '').split(' ')[0]);
    const before = await column();
    const box = await bar.boundingBox();
    if (!box) throw new Error('the item has no box');
    const cell = box.width; // a one-day item is one column wide
    // Toward the middle of the week, so the item stays in view whichever day today is.
    const step = before <= 3 ? cell : -cell;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + step / 2, y, { steps: 5 });
    await page.mouse.move(x + step, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(column).toBe(before + (before <= 3 ? 1 : -1));
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(column).toBe(before);
  });

  test('dragging an item in the month moves it a week, and undo puts it back', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Month drag');
    const bar = page.locator('.month .bar', { hasText: 'Month drag' });
    const weekIndex = () =>
      bar.evaluate((el) =>
        [...document.querySelectorAll('.month .week')].indexOf(el.closest('.week')!),
      );
    const before = await weekIndex();
    const rows = await page.locator('.month .week').count();
    const down = before < rows - 1;
    const box = await bar.boundingBox();
    const row = await bar.locator('xpath=ancestor::*[contains(@class,"week")][1]').boundingBox();
    if (!box || !row) throw new Error('the item has no box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const dy = down ? row.height : -row.height;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + dy / 2, { steps: 6 });
    await page.mouse.move(x, y + dy, { steps: 6 });
    await page.mouse.up();
    await expect.poll(weekIndex).toBe(before + (down ? 1 : -1));
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(weekIndex).toBe(before);
  });

  test('editing and deleting work, and undo brings the event back', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Lunch');
    await page.getByRole('button', { name: /Lunch/ }).first().click();
    await page
      .getByRole('dialog', { name: 'Lunch' })
      .getByRole('button', { name: 'Edit event' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Edit event' });
    await dialog.getByLabel('Title').fill('Late lunch');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /Late lunch/ }).first()).toBeVisible();

    await page
      .getByRole('button', { name: /Late lunch/ })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Late lunch' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('button', { name: /Late lunch/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: /Late lunch/ }).first()).toBeVisible();
  });

  test('search finds an event written with different Arabic spelling', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'اجتماع المدرسة');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('المَدرسه');
    await expect(
      page.getByRole('dialog', { name: 'Search' }).getByText('اجتماع المدرسة'),
    ).toBeVisible();
  });
});

test.describe('offline (the app is cached by its service worker)', () => {
  test('after the first visit the app and its data open with the network cut', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await addEvent(page, 'Offline check');
    // The worker installs in the background: wait until it controls this page.
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true);
    await expect(page.getByText('The app is ready to work offline.')).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Offline check/ }).first()).toBeVisible();

    // And it still works offline: write something new.
    await addEvent(page, 'Written offline');
    await expect(page.getByRole('button', { name: /Written offline/ }).first()).toBeVisible();
    await context.setOffline(false);
  });

  test('the worker only ever caches under its own prefix (it shares the domain with other apps)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true);
    const names = await page.evaluate(() => caches.keys());
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.startsWith('nawy-today:')).toBe(true);
  });
});

test.describe('the manifest', () => {
  test('is valid and every icon it names is served as an image', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('./manifest.webmanifest');
    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = (await manifestResponse.json()) as {
      icons: { src: string; purpose: string }[];
      display: string;
      theme_color: string;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const r = await request.get(`/${icon.src}`);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()['content-type']).toContain('image/png');
    }
  });
});

test.describe('security (D-010)', () => {
  test('markup in a title is shown as text and never runs', async ({ page }) => {
    await page.goto('/');
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    await addEvent(page, evil);
    await page.reload();
    await expect(page.getByRole('button', { name: /<img src=x/ }).first()).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
    ).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });

  test('the policy blocks an injected inline script and any outside request', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.violatedDirective),
      );
      const s = document.createElement('script');
      s.textContent = 'window.__injected = 1';
      document.head.appendChild(s);
      let outside = 'allowed';
      try {
        await fetch('https://example.com/');
      } catch {
        outside = 'blocked';
      }
      await new Promise((r) => setTimeout(r, 100));
      return {
        ran: (window as unknown as { __injected?: number }).__injected === 1,
        outside,
        violations,
      };
    });
    expect(result.ran).toBe(false);
    expect(result.outside).toBe('blocked');
    expect(result.violations.some((v) => v.startsWith('script-src'))).toBe(true);
    expect(result.violations.some((v) => v.startsWith('connect-src'))).toBe(true);
  });
});

test.describe('Arabic, right to left', () => {
  test.use({ locale: 'ar-SA' });

  test('opens in Arabic with a right-to-left page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('button', { name: 'إضافة حدث' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens on the Today list, fits the screen, and Back closes the editor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Agenda' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(
          (el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5,
        )
        .slice(0, 8)
        .map(
          (el) =>
            `${el.tagName}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`,
        ),
    );
    expect(overflow, `wider than the screen: ${offenders.join(' | ')}`).toBeLessThanOrEqual(0);

    await addEvent(page, 'On my phone');
    await expect(page.getByRole('button', { name: /On my phone/ })).toBeVisible();

    await page.getByRole('button', { name: /On my phone/ }).click();
    const dialog = page.getByRole('dialog', { name: 'On my phone' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Agenda' })).toBeVisible(); // still in the app
  });

  test('the menu lines its buttons and lists up inside the drawer (D-056)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    const boxes = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width };
      };
      const side = document.querySelector('.sidebar');
      return {
        side: side ? box(side) : null,
        // Hidden ones (the shortcuts button on a touch screen) have no box and are not measured.
        buttons: [...document.querySelectorAll('.sidebar-settings > .btn')]
          .map(box)
          .filter((b) => b.width > 0),
        selects: [...document.querySelectorAll('.sidebar-settings select')].map(box),
      };
    });
    // A phone has no keyboard to speak of: its menu does not offer the shortcuts list.
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
    expect(boxes.side).not.toBeNull();
    expect(boxes.buttons.length).toBeGreaterThan(0);
    const widths = [...boxes.buttons, ...boxes.selects].map((b) => Math.round(b.width));
    expect(new Set(widths).size, `widths differ: ${widths.join(', ')}`).toBe(1);
    for (const b of [...boxes.buttons, ...boxes.selects]) {
      expect(b.left).toBeGreaterThanOrEqual((boxes.side?.left ?? 0) - 0.5);
      expect(b.right).toBeLessThanOrEqual((boxes.side?.right ?? 0) + 0.5);
    }
  });

  test('the month keeps its grid and lists the chosen day under it (D-059)', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Listed under the month');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    const title = page.locator('.month-day-title');
    await expect(title).toBeVisible();
    await expect(
      page.locator('.month-day').getByRole('button', { name: /Listed under the month/ }),
    ).toBeVisible();
    const before = await title.textContent();
    await page.locator('.day-btn[aria-pressed="false"]').nth(10).click();
    await expect(title).not.toHaveText(before ?? '');
    await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The grid is still on screen after the list scrolled or changed.
    await expect(page.locator('.month-split .month')).toBeInViewport();
  });

  test('a tap on an empty spot of the day starts an event at that time (D-060)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    const col = page.locator('.tg-col').first();
    await expect(col).toBeVisible();
    const scroll = await page.locator('.tg-scroll').boundingBox();
    const box = await col.boundingBox();
    expect(scroll && box).toBeTruthy();
    // Tap the middle of what is on screen, and work out which half hour that is.
    const y = (scroll?.y ?? 0) + (scroll?.height ?? 0) / 2;
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const half = Math.min(47, Math.floor(((y - (box?.y ?? 0)) / (box?.height ?? 1)) * 48));
    const hour = String(Math.floor(half / 2)).padStart(2, '0');
    const expected = `${hour}:${half % 2 === 0 ? '00' : '30'}`;
    await page.touchscreen.tap(x, y);
    const dialog = page.getByRole('dialog', { name: 'New event' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Starts · Time')).toHaveValue(expected);
    // The title is ready to type into, without another tap.
    await expect(dialog.getByLabel('Title')).toBeFocused();
  });

  test('the editor fits the screen, with a repeat rule open too (D-058)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add event' }).click();
    const dialog = page.getByRole('dialog', { name: 'New event' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Repeat').selectOption({ label: 'Weekly' });
    const outside = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [...document.querySelectorAll<HTMLElement>('[role="dialog"] *')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.left < -0.5 || box.right > width + 0.5))
        .slice(0, 8)
        .map(
          ({ el, box }) =>
            `${el.tagName}.${el.className} ${Math.round(box.left)}..${Math.round(box.right)}`,
        );
    });
    expect(outside, 'parts of the editor outside the screen').toEqual([]);
    const body = dialog.locator('.ed-body');
    const scrolls = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(scrolls, 'the form scrolls sideways').toBeLessThanOrEqual(0);
  });

  test('a notice is a bar inside the screen, not a card that wraps', async ({ page }) => {
    await page.goto('/');
    const toast = page.locator('.toast').first();
    await toast.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    test.skip((await toast.count()) === 0, 'no notice appeared in this run');
    const box = await toast.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(390);
    expect(box?.height ?? 999).toBeLessThanOrEqual(80);
  });

  test('buttons are at least 44px tall', async ({ page }) => {
    await page.goto('/');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, a[href], input, select')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.height > 0 && box.height < 43.5)
        .map(
          ({ el, box }) =>
            `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)}" ${Math.round(box.height)}px`,
        ),
    );
    expect(small).toEqual([]);
  });
});
