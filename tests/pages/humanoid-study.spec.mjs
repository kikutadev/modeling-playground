import { test, expect } from '@playwright/test';

test('GitHub Pages build serves the continuous humanoid Swing Play preview', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  await page.goto('./humanoid-study.html');
  await expect(page.locator('#status')).toHaveText('Swing Play', { timeout: 15_000 });
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#mode-swing')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#actions')).toHaveText('7');
  await expect(page.locator('#meshes')).toHaveText('14');
  await expect(page.locator('#swing-speed')).not.toHaveText('—');
  expect(new URL(page.url()).pathname).toMatch(/\/modeling-playground\/humanoid-study\.html$/);
  expect(errors).toEqual([]);
});
