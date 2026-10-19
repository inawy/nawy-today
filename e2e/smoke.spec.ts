import { expect, test } from '@playwright/test';

test('the production build opens on the month with a heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', /rtl|ltr/);
});
