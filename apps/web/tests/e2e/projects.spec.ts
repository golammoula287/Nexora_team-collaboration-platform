import { expect, test, type Page } from '@playwright/test';

/**
 * Spaces and projects through the browser.
 *
 * Runs against the live API and Neon, so it covers the whole path the phase 4
 * gate cares about: a form validated by the shared schema, a route behind the
 * funnel, a service using withOrg, and a page that renders the result.
 */

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `projects-${run}@example.test`;
const orgSlug = `proj-${run}`;

let page: Page;

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();

  // Sign up, verify, and create a workspace to work in.
  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Projects Tester');
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
  await page.getByLabel('Workspace name', { exact: false }).fill('Projects Co');
  await page.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });
});

test('a workspace with no spaces cannot create a project yet', async () => {
  await page.goto(`/${orgSlug}/projects`);

  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('No projects yet')).toBeVisible();

  // Without a space there is nothing to create a project in, so the button
  // says so rather than opening a dialog that cannot be completed.
  await expect(page.getByRole('button', { name: 'New project' })).toBeDisabled();
});

test('creating a space enables project creation', async () => {
  // Spaces have no UI yet - phase 4.1 ships the API for them and the project
  // screens; the space form arrives with the settings screens.
  const created = await page.request.post(`${API}/orgs/${orgSlug}/spaces`, {
    headers: { origin: WEB, 'content-type': 'application/json' },
    data: { name: 'Client Work', slug: 'client-work' },
  });
  expect(created.status()).toBe(201);

  await page.reload();
  await expect(page.getByRole('button', { name: 'New project' })).toBeEnabled();
});

test('creates a project through the dialog and lands on it', async () => {
  await page.getByRole('button', { name: 'New project' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Name', { exact: false }).fill('Northwind Rebrand');
  // The key is suggested from the name, so it should already be filled.
  await expect(dialog.getByLabel('Key', { exact: false })).toHaveValue('NR');

  await dialog.getByLabel('Key', { exact: false }).fill('NWR');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });

  await expect(page.getByRole('heading', { name: 'Northwind Rebrand' })).toBeVisible();
  await expect(page.getByText('NWR')).toBeVisible();
});

test('the new project has a usable board', async () => {
  // Four columns from creation - an empty board would be useless.
  for (const column of ['Backlog', 'In progress', 'In review', 'Done']) {
    await expect(page.getByText(column, { exact: true })).toBeVisible();
  }
});

test('shows the validation message from the shared schema', async () => {
  await page.goto(`/${orgSlug}/projects`);
  await page.getByRole('button', { name: 'New project' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: false }).fill('Second Project');
  await dialog.getByLabel('Key', { exact: false }).fill('X');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  // The same rule the API enforces, reported before the request is made.
  await expect(dialog.getByText(/At least 2 characters/)).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('reports a duplicate key from the API rather than failing silently', async () => {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Key', { exact: false }).fill('NWR');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(dialog.getByRole('alert')).toContainText(/already used/i);
});

test('the project list shows what was created', async () => {
  await page.keyboard.press('Escape');
  await page.goto(`/${orgSlug}/projects`);

  await expect(page.getByText('Northwind Rebrand')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Client Work')).toBeVisible();
  await expect(page.getByText('1 project')).toBeVisible();
});

test('a project id from another workspace gives 404', async () => {
  // The API answers 404 for both "no such project" and "not yours"; the page
  // must render the not-found state rather than an error.
  await page.goto(`/${orgSlug}/projects/01a06800-0000-7000-8000-000000000000`);
  await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 20_000 });
});
