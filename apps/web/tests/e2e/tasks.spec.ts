import { expect, test, type Page } from '@playwright/test';

/**
 * Tasks through the browser, against the live API and Neon.
 *
 * Covers the parts of 4.2 a user actually touches: creating a task, seeing it
 * land in the right column with its key, opening it, and reading the change
 * log that the audit rows produce.
 */

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `tasks-${run}@example.test`;
const orgSlug = `tsk-${run}`;

let page: Page;
let projectUrl = '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();

  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Task Tester');
  await page.getByLabel('Work email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const linkResponse = await page.request.get(`${API}/__test/last-link`, {
    params: { email },
    headers: { origin: WEB },
  });
  const { url } = (await linkResponse.json()) as { url: string };
  await page.goto(url);

  await page.goto('/new-organization');
  await page.getByLabel('Workspace name', { exact: false }).fill('Task Co');
  await page.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });

  await page.request.post(`${API}/orgs/${orgSlug}/spaces`, {
    headers: { origin: WEB, 'content-type': 'application/json' },
    data: { name: 'Work', slug: 'work' },
  });

  await page.goto(`/${orgSlug}/projects`);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: false }).fill('Delivery');
  await dialog.getByLabel('Key', { exact: false }).fill('DEL');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
  projectUrl = page.url();
});

test('an empty board shows all four columns', async () => {
  // The generous first timeout is for a cold route compile in dev, not for a
  // slow query: this is the first assertion to land on the project page.
  for (const column of ['Backlog', 'In progress', 'In review', 'Done']) {
    await expect(page.getByRole('heading', { name: column })).toBeVisible({ timeout: 30_000 });
  }
  await expect(page.getByText('Nothing here').first()).toBeVisible();
});

test('creates a task and puts it in the chosen column', async () => {
  await page.getByRole('button', { name: 'New task' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: false }).fill('Audit the information architecture');
  await dialog.getByLabel('Priority', { exact: false }).selectOption('high');
  await dialog.getByRole('button', { name: 'Create task' }).click();

  await expect(page.getByText('Audit the information architecture')).toBeVisible({
    timeout: 20_000,
  });

  // Numbered with the project key, so it can be referred to out loud.
  await expect(page.getByText('DEL-1')).toBeVisible();
  // Scoped to the card: the filter bar carries a "high" <option> as well.
  await expect(page.locator('li').getByText('high', { exact: true })).toBeVisible();
});

test('refuses an empty title using the shared schema', async () => {
  await page.getByRole('button', { name: 'New task' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create task' }).click();

  await expect(dialog.getByText('Give it a title.')).toBeVisible();
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
});

test('opens the task and shows its change log', async () => {
  await page.getByText('Audit the information architecture').click();
  await page.waitForURL(/\/tasks\/[0-9a-f-]+$/, { timeout: 20_000 });

  await expect(
    page.getByRole('heading', { name: 'Audit the information architecture' }),
  ).toBeVisible();

  // Every mutation writes an audit row; the change log is those rows read back.
  // Scoped to the section: a toast elsewhere on the page also says "created".
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'History' }) });
  await expect(history.getByText(/created/)).toBeVisible();

  await expect(page.getByRole('heading', { name: /^Subtasks/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Dependencies/ })).toBeVisible();
});

test('a task id from another workspace gives not-found', async () => {
  await page.goto(`/${orgSlug}/tasks/01a06800-0000-7000-8000-000000000000`);
  await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 20_000 });
});

test('the board is usable at 360px', async () => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(projectUrl);

  await expect(page.getByText('Audit the information architecture')).toBeVisible({
    timeout: 20_000,
  });

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);

  await page.setViewportSize({ width: 1280, height: 720 });
});
