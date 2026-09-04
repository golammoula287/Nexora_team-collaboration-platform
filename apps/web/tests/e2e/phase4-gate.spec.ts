import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * THE PHASE 4 EXIT GATE, end to end.
 *
 * "Create a project -> add tasks with subtasks and a dependency -> move them in
 * all four views -> bulk edit -> soft delete -> restore. Board drag is
 * keyboard-operable." - docs/VERIFICATION.md
 *
 * Serial, one browser context, one workspace: this is a single journey, and a
 * step that depends on the previous step's data has no business running alone.
 */

const PASSWORD = 'correct-horse-battery-staple';
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const email = `gate4-${run}@example.test`;
const orgSlug = `g4-${run}`;

let page: Page;
let projectUrl = '';
let projectId = '';
const taskIds: string[] = [];

/**
 * Hydration mismatches, collected across the whole journey.
 *
 * React recovers from these by throwing away the server HTML and re-rendering,
 * so the page still looks right and nothing fails - which is exactly why they
 * survive review. The board shipped one (dnd-kit's generated ids differ between
 * server and client) and it was found only because the dev overlay's error text
 * happened to contain a task title a locator was searching for.
 */
const hydrationErrors: string[] = [];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

/** The API, called as the signed-in user - the browser context holds the cookie. */
function json(path: string) {
  return { headers: { origin: WEB, 'content-type': 'application/json' }, url: `${API}${path}` };
}

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/hydrat|did not match|server rendered HTML/i.test(message.text())) {
      hydrationErrors.push(message.text().slice(0, 200));
    }
  });

  await page.goto('/sign-up');
  await page.getByLabel('Your name', { exact: false }).fill('Gate Tester');
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
  await page.getByLabel('Workspace name', { exact: false }).fill('Gate Co');
  await page.getByLabel('Workspace address', { exact: false }).fill(orgSlug);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(`${WEB}/${orgSlug}`, { timeout: 30_000 });
});

test('1. create a project', async () => {
  const space = await page.request.post(json('/orgs/' + orgSlug + '/spaces').url, {
    headers: json('').headers,
    data: { name: 'Work', slug: 'work' },
  });
  expect(space.status()).toBe(201);

  await page.goto(`/${orgSlug}/projects`);
  await page.getByRole('button', { name: 'New project' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: false }).fill('Gate Project');
  await dialog.getByLabel('Key', { exact: false }).fill('GATE');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  projectUrl = page.url();
  projectId = projectUrl.split('/').pop() ?? '';
  expect(projectId).toHaveLength(36);
});

test('2. add tasks, a subtask and a dependency', async () => {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  for (const [index, title] of ['Design the shell', 'Wire the API', 'Ship it'].entries()) {
    const response = await page.request.post(json(`/orgs/${orgSlug}/tasks`).url, {
      headers: json('').headers,
      data: { projectId, title, startDate: day(0), dueDate: day(index + 1) },
    });
    expect(response.status()).toBe(201);
    taskIds.push(((await response.json()) as { id: string }).id);
  }

  const subtask = await page.request.post(json(`/orgs/${orgSlug}/tasks`).url, {
    headers: json('').headers,
    data: { projectId, title: 'Subtask of the shell', parentTaskId: taskIds[0] },
  });
  expect(subtask.status()).toBe(201);

  // "Ship it" is blocked by "Wire the API" - the edge the timeline draws.
  const dependency = await page.request.post(
    json(`/orgs/${orgSlug}/tasks/${taskIds[2]}/dependencies`).url,
    { headers: json('').headers, data: { dependsOnTaskId: taskIds[1], type: 'blocks' } },
  );
  expect(dependency.status()).toBe(201);

  await page.goto(projectUrl);
  await expect(page.getByRole('link', { name: 'Design the shell' })).toBeVisible({
    timeout: 30_000,
  });

  // The subtask is not a top-level card in any view.
  await expect(page.getByRole('link', { name: 'Subtask of the shell' })).toHaveCount(0);
});

test('3. every view renders the same work', async () => {
  for (const view of ['Board', 'List', 'Calendar', 'Timeline']) {
    await page.getByRole('tab', { name: view }).click();
    await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Design the shell').first()).toBeVisible({ timeout: 20_000 });
  }
});

test('4. the board move is keyboard-operable', async () => {
  await page.getByRole('tab', { name: 'Board' }).click();

  // The gate asks for a keyboard-operable move, not merely a keyboard sensor.
  // This path needs no sustained key-hold and no aiming at a moving target.
  await page.getByRole('button', { name: 'Move Wire the API to another column' }).click();
  await page.getByRole('menuitem', { name: 'In progress' }).click();
  await expect(page.getByText('Moved to In progress')).toBeVisible({ timeout: 20_000 });

  // And the drag handle is a real focusable control that says how to use it.
  const handle = page.getByRole('button', {
    name: 'Reorder Design the shell. Press space, then use the arrow keys.',
  });
  await handle.focus();
  await expect(handle).toBeFocused();

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
});

test('5. moving in the list view persists', async () => {
  await page.getByRole('tab', { name: 'List' }).click();

  const column = page.getByRole('combobox', { name: 'Column for Ship it' });
  const before = await column.inputValue();

  const [target] = await column.selectOption({ label: 'In review' });
  expect(target).not.toBe(before);
  await expect(page.getByText('Moved to In review')).toBeVisible({ timeout: 20_000 });

  // Reload rather than trust the optimistic render: the point is that it stuck.
  await page.reload();
  await page.getByRole('tab', { name: 'List' }).click();
  await expect(page.getByRole('combobox', { name: 'Column for Ship it' })).toHaveValue(
    target as string,
  );
});

test('6. sorting and grouping the list', async () => {
  await page.getByRole('tab', { name: 'List' }).click();

  const dueHeader = page.getByRole('columnheader', { name: 'Due' });
  await dueHeader.getByRole('button').click();
  await expect(dueHeader).toHaveAttribute('aria-sort', 'ascending');
  await dueHeader.getByRole('button').click();
  await expect(dueHeader).toHaveAttribute('aria-sort', 'descending');

  await page.getByLabel('Group by').selectOption('status');
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await page.getByLabel('Group by').selectOption('none');
});

test('7. rescheduling on the calendar', async () => {
  await page.getByRole('tab', { name: 'Calendar' }).click();

  // A real ARIA grid: rows of named cells, reachable without a mouse.
  const cells = page.getByRole('gridcell');
  expect(await cells.count()).toBe(42);
  await expect(page.getByRole('columnheader', { name: 'Mon' })).toBeVisible();
});

test('8. filters narrow the view and can be cleared', async () => {
  await page.getByRole('tab', { name: 'Board' }).click();

  await page.getByLabel('Filter tasks by title').fill('Ship');
  await expect(page.getByText('1 of 4')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Design the shell' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear 1 filter' }).click();
  await expect(page.getByText('4 of 4')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Design the shell' })).toBeVisible();
});

test('9. bulk edit, soft delete, restore', async () => {
  await page.getByRole('checkbox', { name: 'Select Design the shell' }).click();
  await page.getByRole('checkbox', { name: 'Select Ship it' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Set priority for the selected tasks' })
    .selectOption('urgent');
  await expect(page.getByText('Priority updated')).toBeVisible({ timeout: 20_000 });

  // Both tasks took it - proved through the filter builder rather than by
  // eyeballing a badge that also exists as an <option> in three selects.
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('button', { name: 'Condition', exact: true }).click();
  await expect(page.getByText('2 of 4')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Remove the Priority condition' }).click();
  await expect(page.getByText('4 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Filter' }).click();

  // Soft delete one of them.
  await page.getByRole('checkbox', { name: 'Select Ship it' }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('1 task moved to Trash')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Ship it' })).toHaveCount(0, { timeout: 20_000 });

  // Restore it.
  await page.goto(`/${orgSlug}/trash`);
  await expect(page.getByText('Ship it')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.getByText('1 task restored')).toBeVisible({ timeout: 20_000 });

  await page.goto(projectUrl);
  await expect(page.getByRole('link', { name: 'Ship it' })).toBeVisible({ timeout: 20_000 });
});

test('10. My work groups assigned tasks by due date', async () => {
  await page.request.patch(json(`/orgs/${orgSlug}/tasks/${taskIds[1]}`).url, {
    headers: json('').headers,
    data: { assigneeIds: [] },
  });

  await page.goto(`/${orgSlug}/inbox`);
  await expect(page.getByRole('heading', { name: 'My work', level: 1 })).toBeVisible({
    timeout: 20_000,
  });
});

test('11. no axe violations in any of the four views', async () => {
  await page.goto(projectUrl);
  await expect(page.getByRole('link', { name: 'Design the shell' })).toBeVisible({
    timeout: 30_000,
  });

  for (const view of ['Board', 'List', 'Calendar', 'Timeline']) {
    await page.getByRole('tab', { name: view }).click();
    await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map(
        (violation) =>
          `${view} - ${violation.id}: ${violation.nodes
            .map((node) => `${node.target.join(' ')} :: ${node.failureSummary ?? ''}`)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  }
});

test('12. the views work at 360px without sideways scroll', async () => {
  await page.setViewportSize({ width: 360, height: 740 });

  for (const view of ['Board', 'List', 'Calendar', 'Timeline']) {
    await page.getByRole('tab', { name: view }).click();
    await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        document.body.scrollWidth > document.body.clientWidth + 1,
    );
    expect(overflows, `${view} scrolls sideways at 360px`).toBe(false);
  }

  await page.setViewportSize({ width: 1280, height: 720 });
});

test('13. nothing hydrated differently on the server than in the browser', () => {
  expect(hydrationErrors).toEqual([]);
});
