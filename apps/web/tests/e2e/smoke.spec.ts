import { expect, test } from '@playwright/test';

/** The two apps are wired together and both answer. */
test('the landing page reports the API as reachable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/API up/)).toBeVisible();
});

test('the API answers its health check directly', async ({ request }) => {
  const res = await request.get('http://localhost:4000/health');

  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, service: 'nexora-api' });
});
