import { test, expect } from '@playwright/test';

test('dedicated humanoid preview opens in continuous Swing Play and keeps Action Study available', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/humanoid-study.html');

  await expect(page.locator('#status')).toHaveText('Swing Play', { timeout: 15_000 });
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#bones')).toHaveText('22');
  await expect(page.locator('#meshes')).toHaveText('14');
  await expect(page.locator('#actions')).toHaveText('7');
  await expect(page.locator('#mode-swing')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#swing-controls')).toBeVisible();
  await expect(page.locator('#action-section')).toBeHidden();
  await expect(page.locator('#view-section')).toBeHidden();

  const firstFrame = await page.locator('canvas').screenshot();
  await page.waitForTimeout(650);
  const secondFrame = await page.locator('canvas').screenshot();
  expect(secondFrame.equals(firstFrame)).toBe(false);
  await expect(page.locator('#swing-speed')).not.toHaveText('—');
  await expect(page.locator('#swing-blend')).not.toHaveText('—');

  await page.getByRole('button', { name: 'アンカー →', exact: true }).click();
  await expect(page.locator('#swing-rope')).not.toHaveText('—');

  await page.getByRole('button', { name: 'Action Study', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Action Study');
  await expect(page.locator('#action-section')).toBeVisible();
  await expect(page.locator('#view-section')).toBeVisible();
  await expect(page.locator('#clips button')).toHaveText([
    'Neutral', 'SwingReach', 'SwingTuck', 'WallRun', 'AerialAim', 'AirKick', 'Landing',
  ]);

  await page.getByRole('button', { name: 'SwingReach', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SwingReach', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await page.getByLabel('再生位置').fill('0.6');

  await page.getByRole('checkbox', { name: '骨格を表示' }).check();
  await expect(page.getByRole('checkbox', { name: '骨格を表示' })).toBeChecked();
  await page.getByRole('button', { name: '側面', exact: true }).click();
  await expect(page.getByRole('button', { name: '側面', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Swing Play remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/humanoid-study.html');
  await expect(page.locator('#status')).toHaveText('Swing Play', { timeout: 15_000 });
  await expect(page.locator('#mode-swing')).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('canvas').boundingBox();
  expect(box.width).toBe(390);
  expect(box.height).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
