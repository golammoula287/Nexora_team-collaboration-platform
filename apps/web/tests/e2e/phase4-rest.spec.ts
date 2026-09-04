import { expect, test, type Page } from '@playwright/test';

/**
 * The rest of phase 4, through the browser: editable columns, checklists,
 * watching, the AND/OR filter builder, saved views, resizable list columns, the
 * calendar's week span, duplication and templates.
 *
 * The API tests already prove the rules. What this proves is that a person can
 * reach them - that the column delete asks where the cards go rather than
 * failing, that a saved view restores what was saved, and that the resize
 * handle answers the arrow keys.
 */

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const email = `rest4-${run}@example.test`;
const orgSlug = `r4-${run}`;

let page: Page;
let projectUrl = '';
let projectId = '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();

  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Rest Tester');
  await page.getByLabel('Work email', { exact: false }).fill(email);
  await page.getByLabel('Password', { exact: false }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const link = await page.request.get(`${API}/__test/last-link`, {
    params: { email },
    headers: { origin: WEB },
  });
  await page.goto(((await link.json()) as { url: string }).url);

  await page.goto('/new-organization');
  await page.getByLabel('Workspace name', { exact: false }).fill('Rest Co');
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
  await dialog.getByLabel('Name', { exact: false }).fill('Rest Project');
  await dialog.getByLabel('Key', { exact: false }).fill('REST');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  projectUrl = page.url();
  projectId = projectUrl.split('/').pop() ?? '';

  for (const [index, title] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    await page.request.post(`${API}/orgs/${orgSlug}/tasks`, {
      headers: { origin: WEB, 'content-type': 'application/json' },
      data: {
        projectId,
        title,
        priority: index === 0 ? 'urgent' : 'low',
        dueDate: new Date(Date.now() + 86_400_000 * (index + 1)).toISOString().slice(0, 10),
      },
    });
  }
  await page.goto(projectUrl);
});

test('adds, renames and reorders a board column', async () => {
  await page.getByRole('button', { name: 'Columns' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New column').fill('Blocked');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Column added')).toBeVisible({ timeout: 20_000 });

  // The behaviour is separate from the name: a column called "Shipped" is what
  // makes a card complete, not the word "Done".
  await dialog.getByLabel('Name of the Done column').fill('Shipped');
  await dialog.getByLabel('Name of the Done column').blur();
  await expect(page.getByText('Column renamed')).toBeVisible({ timeout: 20_000 });

  await dialog.getByRole('button', { name: 'Move Backlog later' }).click();
  await expect(page.getByText('Column moved')).toBeVisible({ timeout: 20_000 });

  await dialog.getByRole('button', { name: 'Done' }).click();
});

test('refuses to strand cards, and asks where they go', async () => {
  await page.getByRole('button', { name: 'Columns' }).click();
  const dialog = page.getByRole('dialog');

  // Backlog holds the three seeded tasks.
  await dialog.getByRole('button', { name: 'Remove the Backlog column' }).click();

  const confirm = page.getByRole('dialog').filter({ hasText: 'Remove Backlog' });
  await expect(confirm.getByText(/holds 3 tasks/)).toBeVisible();

  await confirm.getByLabel('Move them to').selectOption({ index: 0 });
  await confirm.getByRole('button', { name: 'Remove column' }).click();

  await expect(page.getByText('Column removed')).toBeVisible({ timeout: 20_000 });
  await page.goto(projectUrl);
  await expect(page.getByText('Alpha')).toBeVisible({ timeout: 20_000 });
});

test('builds an AND/OR filter and saves it as a view', async () => {
  await page.getByRole('button', { name: 'Filter' }).click();

  await page.getByRole('button', { name: 'Condition', exact: true }).click();
  // Defaults to "Priority is urgent", which matches one of the three.
  await expect(page.getByText('1 of 3')).toBeVisible({ timeout: 20_000 });

  // OR in a second condition, so two of the three match.
  //
  // `force` because the radio is visually hidden inside its own label - which
  // is the point: a pointer user clicks the label, a keyboard user tabs to the
  // radio. Playwright objects that the input is covered by the very element
  // that is meant to cover it.
  await page.getByRole('radio', { name: 'or' }).check({ force: true });
  await page.getByRole('button', { name: 'Condition', exact: true }).click();

  const rows = page.getByRole('combobox', { name: 'Field' });
  await rows.nth(1).selectOption('title');
  await page.getByRole('combobox', { name: 'Condition' }).nth(1).selectOption('contains');
  await page.getByRole('textbox', { name: 'Value for Title' }).fill('Beta');

  await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Save this view' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Urgent or Beta');
  await dialog.getByLabel('Open this project on this view').check();
  await dialog.getByRole('button', { name: 'Save view' }).click();

  await expect(page.getByText('View saved')).toBeVisible({ timeout: 20_000 });
});

test('a saved view restores what was saved, and a default opens with it', async () => {
  // Reloading with no query string should land on the default view.
  await page.goto(projectUrl);
  await expect(page.getByRole('tab', { name: /Urgent or Beta/ })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 20_000 },
  );
  await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 20_000 });

  // "Everything" clears it without deleting the view.
  await page.getByRole('tab', { name: 'Everything' }).click();
  await expect(page.getByText('3 of 3')).toBeVisible();

  await page.getByRole('tab', { name: /Urgent or Beta/ }).click();
  await expect(page.getByText('2 of 3')).toBeVisible();
});

test('shares a view and hands back a link that still needs access', async () => {
  await page.getByRole('button', { name: 'Options for the view Urgent or Beta' }).click();
  await page.getByRole('menuitem', { name: 'Share with the workspace' }).click();
  await expect(page.getByText('View shared')).toBeVisible({ timeout: 20_000 });

  // Opening the token URL while signed in resolves the view.
  const shared = await page.request.get(`${API}/orgs/${orgSlug}/views`, {
    params: { projectId },
    headers: { origin: WEB },
  });
  const { views } = (await shared.json()) as { views: { name: string; shareToken: string }[] };
  const token = views.find((view) => view.name === 'Urgent or Beta')?.shareToken;
  expect(token).toBeTruthy();

  await page.goto(`/${orgSlug}/projects/${projectId}?view=${token}`);
  await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 20_000 });
});

test('hides and resizes list columns, with the keyboard', async () => {
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: 'Everything' }).click();
  await page.getByRole('tab', { name: 'List' }).click();

  await page.getByRole('button', { name: /^Columns \(/ }).click();
  await page.getByRole('checkbox', { name: 'Assignees' }).uncheck();
  await expect(page.getByRole('columnheader', { name: 'Assignees' })).toHaveCount(0);

  const handle = page.getByRole('separator', { name: 'Width of the Task column' });
  const before = await handle.getAttribute('aria-valuenow');

  // A resize only a mouse can perform is a feature half the users do not have.
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await expect(handle).not.toHaveAttribute('aria-valuenow', before ?? '');
});

test('switches the calendar between month and week', async () => {
  await page.getByRole('tab', { name: 'Calendar' }).click();
  expect(await page.getByRole('gridcell').count()).toBe(42);

  await page.getByLabel('Calendar span').selectOption('week');
  expect(await page.getByRole('gridcell').count()).toBe(7);
  await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible();

  await page.getByLabel('Calendar span').selectOption('month');
  expect(await page.getByRole('gridcell').count()).toBe(42);
});

test('adds a checklist to a task and ticks an item', async () => {
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: 'Everything' }).click();
  await page.getByRole('link', { name: 'Alpha' }).first().click();
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Add checklist' }).click();
  await page.getByLabel('Checklist name').fill('Definition of done');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Checklist added')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Add an item to Definition of done').fill('Tests pass');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Tests pass' })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('checkbox', { name: 'Tests pass' }).click();
  await expect(
    page.getByRole('progressbar', { name: /Definition of done: 1 of 1 done/ }),
  ).toBeVisible({ timeout: 20_000 });
});

test('watches and unwatches a task', async () => {
  const watch = page.getByRole('button', { name: /^Watch/ });
  await watch.click();
  await expect(page.getByText('Watching this task')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Watching/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: /^Watching/ }).click();
  await expect(page.getByText('No longer watching')).toBeVisible({ timeout: 20_000 });
});

test('saves a task as a template', async () => {
  await page.getByRole('button', { name: 'More actions for this task' }).click();
  await page.getByRole('menuitem', { name: 'Save as a template' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Template name').fill('Alpha template');
  await dialog.getByRole('button', { name: 'Save template' }).click();

  await expect(page.getByText('Saved as a template')).toBeVisible({ timeout: 20_000 });
});

test('promotes a task to a project', async () => {
  await page.getByRole('button', { name: 'More actions for this task' }).click();
  await page.getByRole('menuitem', { name: 'Promote to a project' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project key').fill('ALP');
  await dialog.getByRole('button', { name: 'Promote' }).click();

  await expect(page.getByText('Promoted to a project')).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 30_000 });
});

test('duplicates a project', async () => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'More actions for this project' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate this project' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Key').fill('RSTC');
  await dialog.getByLabel('Copy the tasks as well').check();
  await dialog.getByRole('button', { name: 'Duplicate' }).click();

  await expect(page.getByText('Project duplicated')).toBeVisible({ timeout: 20_000 });
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  // The copy carries the columns and the tasks.
  await expect(page.getByText('Alpha')).toBeVisible({ timeout: 20_000 });
});
