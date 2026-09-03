import { expect, test } from '@playwright/test';

test('the home page reports the API as reachable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Nexora', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'API reachable' })).toBeVisible();
  await expect(page.getByText('nexora-api')).toBeVisible();
});

test('the API answers its health check directly', async ({ request }) => {
  const res = await request.get('http://localhost:4000/health');

  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, service: 'nexora-api' });
});
