import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3001';
const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `docs-${run}@example.test`;
const orgSlug = `docs-${run}`;
let page: Page;

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  page = await context.newPage();
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Docs Tester');
  await page.getByLabel('Work email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const response = await page.request.get(`${API}/__test/last-link`, {
    params: { email },
    headers: { origin: WEB },
  });
  const { url } = (await response.json()) as { url: string };
  await page.goto(url);
  await page.goto('/new-organization');
  await page.getByLabel('Workspace name', { exact: false }).fill('Docs Co');
  await page.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });
});

test.afterAll(async () => {
  await page?.context().close();
});

test('creates and edits a document, then restores a version', async () => {
  await page.goto(`/${orgSlug}/docs`);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.waitForURL(new RegExp(`/${orgSlug}/docs/[0-9a-f-]+$`));
  await page.getByLabel('Document title').fill('Team handbook');
  await page.locator('.doc-editor').fill('Welcome to the team.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Document title')).toHaveValue('Team handbook');
  await expect(page.locator('.doc-editor')).toContainText('Welcome to the team.');
  await page.locator('.doc-editor').fill('Welcome aboard.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(page.getByRole('button', { name: 'Compare' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Compare' }).last().click();
  await expect(page.getByText('Changes from Team handbook to current')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Restore' }).last().click();
  await expect(page.getByRole('status')).toHaveText('Version restored');
});

test('comments on a selection and reuses a saved template', async () => {
  page.once('dialog', (dialog) => void dialog.accept('Handbook template'));
  await page.getByRole('button', { name: 'Save as template' }).click();
  await expect(page.getByRole('status')).toContainText('Template saved');

  await page.locator('.doc-editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Comment on selection' }).click();
  await page.getByLabel('Comment', { exact: true }).fill('Please clarify this introduction.');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Please clarify this introduction.')).toBeVisible();

  await page.goto(`/${orgSlug}/docs`);
  await page.getByLabel('Document template').selectOption({ label: 'Handbook template' });
  await page.getByRole('button', { name: 'New document' }).click();
  await page.waitForURL(new RegExp(`/${orgSlug}/docs/[0-9a-f-]+$`));
  await expect(page.getByLabel('Document title')).toHaveValue('Team handbook');
});
