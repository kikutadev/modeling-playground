import { test, expect } from '@playwright/test';

test('dedicated humanoid study page exposes only the generated action asset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/humanoid-study.html');
  await expect(page.locator('#status')).toHaveText('表示中', { timeout: 15_000 });
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#bones')).toHaveText('22');
  await expect(page.locator('#meshes')).toHaveText('9');
  await expect(page.locator('#actions')).toHaveText('7');
  await expect(page.locator('#clips button')).toHaveText([
    'Neutral', 'SwingReach', 'SwingTuck', 'WallRun', 'AerialAim', 'AirKick', 'Landing',
  ]);

  const initial = await page.locator('canvas').screenshot();
  await page.getByRole('button', { name: 'SwingReach', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SwingReach', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await page.getByLabel('再生位置').fill('0.6');
  expect((await page.locator('canvas').screenshot()).equals(initial)).toBe(false);

  await page.getByRole('checkbox', { name: '骨格を表示' }).check();
  await expect(page.getByRole('checkbox', { name: '骨格を表示' })).toBeChecked();
  await page.getByRole('button', { name: '側面', exact: true }).click();
  await expect(page.getByRole('button', { name: '側面', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('dedicated humanoid study stays usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/humanoid-study.html');
  await expect(page.locator('#status')).toHaveText('表示中', { timeout: 15_000 });
  const box = await page.locator('canvas').boundingBox();
  expect(box.width).toBe(390);
  expect(box.height).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
