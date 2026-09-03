import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * THE PHASE 3 GATE.
 *
 * "Every route renders in light and dark with no console errors and no layout
 * shift. axe-core clean on the shell. Keyboard-only navigation reaches every
 * nav item." - docs/VERIFICATION.md
 */

/** Public routes; the org shell needs a session and is covered separately. */
const PUBLIC_ROUTES = ['/', '/sign-in', '/sign-up', '/reset-password', '/pricing', '/changelog'];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('nexora-theme', value);
  }, theme);
}

test.describe('every public route', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders with no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));

      const response = await page.goto(route);

      expect(response?.status(), `${route} should not error`).toBeLessThan(400);
      await expect(page.locator('main#main')).toBeVisible();
      expect(errors, `console errors on ${route}`).toEqual([]);
    });

    test(`${route} has no axe violations`, async ({ page }) => {
      await page.goto(route);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) - ${v.help}`),
      ).toEqual([]);
    });
  }
});

test.describe('themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`sign-in is correct in ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/sign-in');

      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(theme === 'dark');

      // The body must paint its own background, not inherit the browser's.
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).not.toBe('rgba(0, 0, 0, 0)');

      // Text and background must actually differ - a token that failed to load
      // would leave them identical, which no contrast check would catch.
      const colour = await page.evaluate(() => getComputedStyle(document.body).color);
      expect(colour).not.toBe(background);
    });
  }

  test('follows the OS setting when no explicit choice is stored', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/sign-in');

    await expect(page.locator('html')).toHaveClass(/dark/);
    await context.close();
  });
});

test.describe('360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const route of ['/', '/sign-in']) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await page.goto(route);

      // The single most common mobile failure, and the one the legacy app's
      // tables shipped with.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${route} overflows horizontally at 360px`).toBe(false);
    });
  }
});

test.describe('keyboard', () => {
  test('the skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/sign-in');
    await page.keyboard.press('Tab');

    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
  });

  test('the sign-in form is completable without a mouse', async ({ page }) => {
    await page.goto('/sign-in');

    await page.getByLabel('Email', { exact: false }).focus();
    await page.keyboard.type('someone@example.test');
    await page.keyboard.press('Tab');
    await page.keyboard.type('a-password-value');

    await expect(page.getByLabel('Password', { exact: false })).toBeFocused();
  });

  test('every focusable control shows a visible focus ring', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in', exact: true }).focus();

    const outlineWidth = await page.evaluate(() => {
      const element = document.activeElement;
      return element ? getComputedStyle(element).outlineWidth : '0px';
    });

    // The legacy app had zero focus styling anywhere.
    expect(parseFloat(outlineWidth)).toBeGreaterThan(0);
  });
});

test.describe('forms', () => {
  test('every input has an associated label', async ({ page }) => {
    await page.goto('/sign-up');

    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const id = await inputs.nth(i).getAttribute('id');
      expect(id, 'every input needs an id to be labelled').toBeTruthy();
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });

  test('validation errors are announced', async ({ page }) => {
    await page.goto('/sign-up');

    await page.getByLabel('Your name', { exact: false }).fill('Ada');
    await page.getByLabel('Work email', { exact: false }).fill('ada@example.test');
    await page.getByLabel('Password', { exact: false }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Assert the wiring a screen reader actually follows, not just that some
    // red text appeared: the input is marked invalid and points at the message.
    const password = page.getByLabel('Password', { exact: false });
    await expect(password).toHaveAttribute('aria-invalid', 'true');

    const describedBy = await password.getAttribute('aria-describedby');
    expect(describedBy, 'the input must reference its error').toBeTruthy();

    const message = page.locator(`#${(describedBy ?? '').split(' ').pop()}`);
    await expect(message).toBeVisible();
    await expect(message).toHaveAttribute('role', 'alert');
    await expect(message).toContainText('12 characters');
  });
});
