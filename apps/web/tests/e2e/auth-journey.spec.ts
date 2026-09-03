import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * THE PHASE 2 GATE.
 *
 * "Playwright signup → verify → create org → invite → accept → role change →
 * password reset revokes old sessions → 2FA." - docs/VERIFICATION.md
 *
 * One continuous session rather than eight independent ones, because that is
 * what the gate describes and because signing in repeatedly would not exercise
 * the thing that matters: a cookie issued by :4000 surviving across navigations
 * on :3000.
 *
 * Emailed links are read back from the API's dev-only outbox. Without
 * RESEND_API_KEY the mailer prints links instead of sending them, so this runs
 * with no email provider configured.
 */

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'a-completely-different-password';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

/** Unique per run so repeated runs do not collide with earlier rows in Neon. */
const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ownerEmail = `owner-${run}@example.test`;
const inviteeEmail = `invitee-${run}@example.test`;
const orgSlug = `acme-${run}`;

let ownerContext: BrowserContext;
let owner: Page;
let invitationLink = '';

/** The most recent link the API emailed to an address. */
async function emailedLink(page: Page, email: string): Promise<string> {
  const response = await page.request.get(`${API}/__test/last-link`, {
    params: { email },
    headers: { origin: WEB },
  });
  const body = (await response.json()) as { url?: string | null };
  if (!body.url) throw new Error(`no link was captured for ${email}`);
  return body.url;
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill(name);
  await page.getByLabel('Work email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
}

/**
 * Signs in and waits for the outcome. Clicking only starts the request, so
 * without the wait the next navigation races it - which is how several of these
 * steps failed the first time round.
 */
async function signIn(page: Page, email: string, password = PASSWORD, expectSuccess = true) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  if (expectSuccess) {
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 });
  }
}

test.describe.configure({ mode: 'serial' });

// Each step is a multi-page flow that also pays for a route's first compile in
// dev, so the default 30s is too tight to be meaningful.
test.setTimeout(90_000);

test.beforeAll(async ({ browser }) => {
  ownerContext = await browser.newContext();
  owner = await ownerContext.newPage();
});

test.afterAll(async () => {
  await ownerContext?.close();
});

test.describe('the full authentication journey', () => {
  test('1. sign up - the account exists but cannot sign in yet', async () => {
    await signUp(owner, 'Journey Owner', ownerEmail);

    await signIn(owner, ownerEmail, PASSWORD, false);
    // Verification is required, so this must not produce a session.
    await expect(owner.getByRole('alert').first()).toBeVisible();
    await expect(owner).toHaveURL(/sign-in/);
  });

  test('2. verify the email, which signs you in', async () => {
    const link = await emailedLink(owner, ownerEmail);
    await owner.goto(link);

    // autoSignInAfterVerification is on, so the session exists from here.
    // Reaching a protected route without being bounced proves it.
    await owner.goto('/account/settings');
    await expect(owner.getByRole('heading', { name: 'Security' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('3. create an organization', async () => {
    await owner.goto('/new-organization');
    await owner.getByLabel('Workspace name', { exact: false }).fill('Acme Journey');
    await owner.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
    await owner.getByRole('button', { name: 'Create workspace' }).click();

    await owner.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });
    // The shell rendering means /me resolved the new membership over the
    // cross-origin cookie.
    await expect(owner.getByRole('navigation', { name: 'Main' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('4. invite someone as a member', async () => {
    await owner.goto(`/${orgSlug}/admin`);
    await expect(owner.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible({
      timeout: 20_000,
    });

    await owner.getByLabel('Invite by email', { exact: false }).fill(inviteeEmail);
    await owner.getByLabel('Role', { exact: false }).selectOption('member');
    await owner.getByRole('button', { name: 'Send invitation' }).click();

    await expect(owner.getByText(inviteeEmail)).toBeVisible({ timeout: 20_000 });

    invitationLink = await emailedLink(owner, inviteeEmail);
    expect(invitationLink).toContain('accept-invite');
  });

  test('5. the invitee signs up, verifies and accepts', async ({ browser }) => {
    const context = await browser.newContext();
    const invitee = await context.newPage();

    await signUp(invitee, 'Journey Invitee', inviteeEmail);

    // The signup verification link, which is newer than the invitation.
    const verify = await emailedLink(invitee, inviteeEmail);
    await invitee.goto(verify);

    await invitee.goto(invitationLink.replace(API, WEB));
    await invitee.getByRole('button', { name: 'Accept invitation' }).click();

    // Clicking only starts the request. Wait for the redirect the component
    // performs on success, or the next navigation races the membership write.
    await invitee.waitForURL(`${WEB}/`, { timeout: 30_000 });

    await invitee.goto(`/${orgSlug}`);
    await expect(invitee.getByRole('navigation', { name: 'Main' })).toBeVisible({
      timeout: 20_000,
    });

    // A plain member must not reach the audit log.
    const audit = await invitee.request.get(`${API}/orgs/${orgSlug}/audit-log`, {
      headers: { origin: WEB },
    });
    expect(audit.status()).toBe(403);

    await context.close();
  });

  test('6. the owner promotes the new member', async () => {
    await owner.goto(`/${orgSlug}/admin`);

    const row = owner.locator('li').filter({ hasText: inviteeEmail });
    await row.getByRole('button', { name: /^Manage/ }).click();
    await owner.getByRole('menuitem', { name: 'Make manager' }).click();

    await expect(owner.getByText('Role updated')).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('manager')).toBeVisible({ timeout: 20_000 });
  });

  test('7. a password reset revokes every existing session', async ({ browser }) => {
    // The owner is signed in on `owner`. Reset from a different context, as if
    // from another device, and the first session must stop working.
    const other = await browser.newContext();
    const otherPage = await other.newPage();

    await otherPage.goto('/reset-password');
    await otherPage.getByLabel('Email', { exact: false }).fill(ownerEmail);
    await otherPage.getByRole('button', { name: 'Send reset link' }).click();
    await expect(otherPage.getByText('Check your email')).toBeVisible();

    // Followed as sent: the API link redirects to the web app with the token.
    const resetLink = await emailedLink(otherPage, ownerEmail);
    await otherPage.goto(resetLink);
    await otherPage.waitForURL(/\/reset-password\?token=/, { timeout: 20_000 });
    await otherPage.getByLabel('New password', { exact: false }).fill(NEW_PASSWORD);
    await otherPage.getByRole('button', { name: 'Set new password' }).click();
    await expect(otherPage).toHaveURL(/sign-in/, { timeout: 20_000 });

    // The assertion the gate names: the old session is dead.
    await owner.goto(`/${orgSlug}/admin`);
    await expect(owner).toHaveURL(/sign-in/, { timeout: 20_000 });

    await other.close();
  });

  test('8. sign in with the new password and turn on two-factor', async () => {
    await signIn(owner, ownerEmail, NEW_PASSWORD);

    await owner.goto('/account/settings');
    await expect(owner.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible({
      timeout: 20_000,
    });

    await owner.getByRole('button', { name: 'Turn on' }).click();
    await owner.getByLabel('Confirm your password', { exact: false }).fill(NEW_PASSWORD);
    await owner.getByRole('button', { name: 'Continue' }).click();

    // A TOTP secret to scan, and the field to confirm it with.
    await expect(owner.getByText(/otpauth:\/\/totp/)).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByLabel('Six-digit code', { exact: false })).toBeVisible();
  });
});
