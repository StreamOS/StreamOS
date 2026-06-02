import { test, expect } from '@playwright/test';

test('redirects the app shell to the StreamOS dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).toHaveTitle('StreamOS');
  await expect(page.getByRole('heading', { name: /content- und umsatz-funnel/i })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Analytics' })).toBeVisible();
});

test('navigates from the dashboard to the clip workflow', async ({ page }) => {
  await page.goto('/dashboard');

  await page.getByRole('link', { name: 'VOD analysieren' }).click();

  await expect(page).toHaveURL(/\/dashboard\/clips$/);
  await expect(page.getByRole('heading', { name: /vods analysieren/i })).toBeVisible();
  await expect(page.getByLabel('VOD URL')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clip Analyse starten' })).toBeVisible();
});
