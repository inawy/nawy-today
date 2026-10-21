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

  test('editing and deleting work, and undo brings the event back', async ({ page }) => {
    await page.goto('/');
    await addEvent(page, 'Lunch');
    await page.getByRole('button', { name: /Lunch/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit event' });
    await dialog.getByLabel('Title').fill('Late lunch');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /Late lunch/ }).first()).toBeVisible();

    await page
      .getByRole('button', { name: /Late lunch/ })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Edit event' })
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
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
        .slice(0, 8)
        .map((el) => `${el.tagName}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`),
    );
    expect(overflow, `wider than the screen: ${offenders.join(' | ')}`).toBeLessThanOrEqual(0);

    await addEvent(page, 'On my phone');
    await expect(page.getByRole('button', { name: /On my phone/ })).toBeVisible();

    await page.getByRole('button', { name: /On my phone/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Agenda' })).toBeVisible(); // still in the app
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
