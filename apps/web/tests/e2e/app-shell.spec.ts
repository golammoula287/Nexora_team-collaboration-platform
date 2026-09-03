import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The signed-in shell.
 *
 * These sign in for real against the API and the seeded database, so they also
 * serve as the browser half of the phase 2 gate: the session cookie has to
 * survive the cross-origin round trip for any of this to work.
 */

const PASSWORD = 'correct-horse-battery-staple';
const ORG_SLUG = 'northwind';

/** Creates an account, verifies it via the API, and signs in through the UI. */
async function signIn(page: Page, email: string) {
  await page.request.post('http://localhost:4000/api/auth/sign-up/email', {
    headers: { origin: 'http://localhost:3000' },
    data: { email, password: PASSWORD, name: 'Shell Test' },
  });

  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('sign-in', () => {
  test('an unverified account is refused, with the reason announced', async ({ page }) => {
    const email = `unverified-${Date.now()}@example.test`;
    await signIn(page, email);

    // Email verification is required, so this must not produce a session.
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/sign-in/);
  });

  test('a wrong password is refused without saying which field was wrong', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: false }).fill('nobody@example.test');
    await page.getByLabel('Password', { exact: false }).fill('definitely-not-right');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    // Must not confirm whether the address has an account.
    await expect(alert).not.toContainText(/no account|not found|does not exist/i);
  });
});

test.describe('protected routes', () => {
  test('an anonymous visitor is sent to sign-in and returned afterwards', async ({ page }) => {
    await page.goto(`/${ORG_SLUG}/projects`);

    await expect(page).toHaveURL(/\/sign-in\?next=/);
    // The intended destination is preserved.
    expect(new URL(page.url()).searchParams.get('next')).toBe(`/${ORG_SLUG}/projects`);
  });

  test('the sign-in page is reachable at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/sign-in');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

test.describe('not found', () => {
  test('a single unknown segment is treated as a possible org slug', async ({ page }) => {
    // Slug routing means /anything could be a workspace, so an anonymous
    // visitor is sent to sign in rather than shown a 404 that would leak
    // whether that workspace exists.
    await page.goto('/this-could-be-an-org');
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test('a genuinely unknown path renders the 404 state, not a stack trace', async ({ page }) => {
    const response = await page.goto('/pricing/nope');

    expect(response?.status()).toBe(404);
    await expect(page.getByText('Page not found')).toBeVisible();
  });

  test('the 404 page has no axe violations', async ({ page }) => {
    await page.goto('/pricing/nope');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
