import { expect, test, type Page } from '@playwright/test';

/** Multi-select bulk edit and Trash, through the browser. */

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `ops-${run}@example.test`;
const orgSlug = `ops-${run}`;

let page: Page;
let projectUrl = '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();

  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Ops Tester');
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
  await page.getByLabel('Workspace name', { exact: false }).fill('Ops Co');
  await page.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });

  const space = await page.request.post(`${API}/orgs/${orgSlug}/spaces`, {
    headers: { origin: WEB, 'content-type': 'application/json' },
    data: { name: 'Work', slug: 'work' },
  });
  const { id: spaceId } = (await space.json()) as { id: string };

  const project = await page.request.post(`${API}/orgs/${orgSlug}/projects`, {
    headers: { origin: WEB, 'content-type': 'application/json' },
    data: { spaceId, name: 'Ops', key: 'OPS' },
  });
  const { id: projectId } = (await project.json()) as { id: string };

  for (const title of ['First task', 'Second task', 'Third task']) {
    await page.request.post(`${API}/orgs/${orgSlug}/tasks`, {
      headers: { origin: WEB, 'content-type': 'application/json' },
      data: { projectId, title },
    });
  }

  projectUrl = `${WEB}/${orgSlug}/projects/${projectId}`;
  await page.goto(projectUrl);
});

test('selecting a task reveals the bulk action bar', async () => {
  await expect(page.getByText('First task')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('checkbox', { name: 'Select First task' }).click();

  const bar = page.getByRole('region', { name: 'Bulk actions' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText('1 selected')).toBeVisible();
});

test('bulk sets priority across a selection', async () => {
  await page.getByRole('checkbox', { name: 'Select Second task' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Set priority for the selected tasks' })
    .selectOption('urgent');

  await expect(page.getByText('Priority updated')).toBeVisible({ timeout: 20_000 });
  // Both cards now show the badge. Scoped to the cards, because the filter bar
  // and the bulk bar both carry an <option> with this same text.
  await expect(page.locator('li').getByText('urgent', { exact: true })).toHaveCount(2, {
    timeout: 20_000,
  });
});

test('bulk moves a selection to another column', async () => {
  await page.getByRole('checkbox', { name: 'Select Third task' }).click();
  await page
    .getByRole('combobox', { name: 'Move the selected tasks to a column' })
    .selectOption({ label: 'In review' });

  await expect(page.getByText('Tasks moved')).toBeVisible({ timeout: 20_000 });
});

test('bulk delete moves tasks to Trash and offers a way back', async () => {
  await page.getByRole('checkbox', { name: 'Select First task' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText(/moved to Trash/)).toBeVisible({ timeout: 20_000 });
  // The toast offers the way back, because a soft delete can honestly promise it.
  await expect(page.getByRole('button', { name: 'Open Trash' })).toBeVisible();

  await expect(page.getByText('First task')).toHaveCount(0);
});

test('Trash shows the deleted task with its retention window', async () => {
  await page.goto(`/${orgSlug}/trash`);

  await expect(page.getByRole('heading', { name: 'Trash', level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('First task')).toBeVisible();
  await expect(page.getByText(/30 days left/)).toBeVisible();
});

test('restoring brings the task back to the board', async () => {
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.getByText(/1 task restored/)).toBeVisible({ timeout: 20_000 });

  // Straight to the project: "Ops" is both the workspace and the project name,
  // so clicking by text is ambiguous.
  await page.goto(projectUrl);

  await expect(page.getByText('First task')).toBeVisible({ timeout: 20_000 });
});

test('Trash is empty again', async () => {
  await page.goto(`/${orgSlug}/trash`);
  await expect(page.getByText('Trash is empty')).toBeVisible({ timeout: 20_000 });
});
