import { config } from 'dotenv';
import type { AnyDatabase } from './client.js';
import { newId } from './ids.js';
import { nthPosition } from './ordering.js';
import * as s from './schema/index.js';

/**
 * Demo data.
 *
 * The point is that every screen has real content on first run - an empty
 * board teaches nothing about whether the board works. Deterministic, so two
 * runs produce the same shape and a test can assert against it.
 *
 * Run with `pnpm db:seed` (needs DATABASE_URL), or call `seed(db)` directly -
 * which is what tests/seed.test.ts does against PGlite.
 */

/** mulberry32 - small, fast, and seeded, so the data never shifts between runs. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20260903);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const chance = (p: number) => random() < p;

/** Days from today, as a plain YYYY-MM-DD date. */
function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function at(offsetDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

const PEOPLE = [
  { name: 'Amara Okafor', role: 'owner', title: 'Founder' },
  { name: 'Ben Halvorsen', role: 'admin', title: 'Operations Lead' },
  { name: 'Chidi Nwosu', role: 'admin', title: 'Engineering Manager' },
  { name: 'Dana Petrov', role: 'manager', title: 'Delivery Manager' },
  { name: 'Elif Demir', role: 'manager', title: 'Design Lead' },
  { name: 'Farid Rahman', role: 'member', title: 'Senior Engineer' },
  { name: 'Grace Lindqvist', role: 'member', title: 'Engineer' },
  { name: 'Hugo Martins', role: 'member', title: 'Designer' },
  { name: 'Ines Costa', role: 'member', title: 'QA Engineer' },
  { name: 'Jonah Weiss', role: 'guest', title: 'Client Stakeholder' },
] as const;

const STATUS_COLUMNS = [
  { name: 'Backlog', category: 'todo' as const, color: 'slate' },
  { name: 'In progress', category: 'in-progress' as const, color: 'indigo' },
  { name: 'In review', category: 'in-progress' as const, color: 'amber' },
  { name: 'Done', category: 'done' as const, color: 'green' },
];

const PROJECT_BLUEPRINTS = [
  { space: 0, name: 'Northwind Rebrand', key: 'NWR', status: 'active' as const },
  { space: 0, name: 'Acme Portal Build', key: 'ACME', status: 'active' as const },
  { space: 0, name: 'Vertex Migration', key: 'VTX', status: 'on-hold' as const },
  { space: 1, name: 'Internal Tooling', key: 'TOOL', status: 'active' as const },
  { space: 1, name: 'Hiring Q4', key: 'HIRE', status: 'planning' as const },
  { space: 2, name: 'Design System 2.0', key: 'DS', status: 'active' as const },
];

const TASK_TITLES = [
  'Audit existing information architecture',
  'Define colour and type tokens',
  'Build the navigation shell',
  'Wire authentication flow',
  'Set up staging environment',
  'Write acceptance criteria for checkout',
  'Migrate legacy customer records',
  'Instrument analytics events',
  'Draft client status update',
  'Review accessibility of the data table',
  'Fix layout shift on the dashboard',
  'Add empty states to the project list',
  'Reduce bundle size on first load',
  'Document the release process',
  'Plan the discovery workshop',
  'Prepare the Q4 roadmap deck',
  'Refactor the notification service',
  'Add rate limiting to the public API',
  'Design the onboarding checklist',
  'Triage inbound support requests',
];

const LABEL_NAMES = [
  { name: 'bug', color: 'red' },
  { name: 'feature', color: 'indigo' },
  { name: 'design', color: 'purple' },
  { name: 'research', color: 'cyan' },
  { name: 'urgent', color: 'amber' },
  { name: 'tech-debt', color: 'slate' },
];

export interface SeedResult {
  organizationId: string;
  userIds: string[];
  projectIds: string[];
  taskIds: string[];
}

export async function seed(db: AnyDatabase): Promise<SeedResult> {
  const orgId = newId();

  await db.insert(s.organization).values({
    id: orgId,
    name: 'Northwind Studio',
    slug: 'northwind',
    autoJoinDomain: 'northwind.test',
  });

  // --- People -------------------------------------------------------------
  const userIds: string[] = [];
  for (const [i, person] of PEOPLE.entries()) {
    const userId = newId();
    userIds.push(userId);
    const handle = person.name.toLowerCase().replace(/[^a-z]+/g, '.');

    await db.insert(s.user).values({
      id: userId,
      name: person.name,
      email: `${handle}@northwind.test`,
      emailVerified: true,
      jobTitle: person.title,
      timezone: pick(['UTC', 'Europe/Lisbon', 'America/New_York', 'Asia/Dhaka']),
      lastSeenAt: at(-Math.floor(random() * 5)),
    });

    await db.insert(s.member).values({
      organizationId: orgId,
      userId,
      role: person.role,
    });

    if (i < 6) {
      await db.insert(s.notificationPreferences).values({
        organizationId: orgId,
        userId,
        kind: 'mention',
        cadence: 'instant',
      });
    }
  }

  const owner = userIds[0] as string;
  const staff = userIds.slice(0, 9);

  // --- Teams --------------------------------------------------------------
  for (const [i, name] of ['Engineering', 'Design', 'Delivery'].entries()) {
    const teamId = newId();
    await db.insert(s.team).values({ id: teamId, organizationId: orgId, name });
    for (const userId of staff.slice(i * 3, i * 3 + 4)) {
      await db.insert(s.teamMember).values({ teamId, userId });
    }
  }

  // --- Spaces -------------------------------------------------------------
  const spaceIds: string[] = [];
  for (const [i, name] of ['Client Work', 'Internal', 'Design'].entries()) {
    const spaceId = newId();
    spaceIds.push(spaceId);
    await db.insert(s.spaces).values({
      id: spaceId,
      organizationId: orgId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      description: `${name} projects`,
      position: nthPosition(i),
    });
  }

  // --- Labels -------------------------------------------------------------
  const labelIds: string[] = [];
  for (const label of LABEL_NAMES) {
    const labelId = newId();
    labelIds.push(labelId);
    await db.insert(s.labels).values({
      id: labelId,
      organizationId: orgId,
      name: label.name,
      color: label.color,
    });
  }

  // --- Projects, statuses, sprints, milestones ----------------------------
  const projectIds: string[] = [];
  const statusesByProject = new Map<string, string[]>();
  let sprintIds: string[] = [];

  for (const [i, blueprint] of PROJECT_BLUEPRINTS.entries()) {
    const projectId = newId();
    projectIds.push(projectId);

    await db.insert(s.projects).values({
      id: projectId,
      organizationId: orgId,
      spaceId: spaceIds[blueprint.space] as string,
      name: blueprint.name,
      key: blueprint.key,
      description: `${blueprint.name} - seeded demo project.`,
      status: blueprint.status,
      startDate: day(-60 + i * 5),
      dueDate: day(30 + i * 10),
      ownerId: pick(staff.slice(0, 5)),
      color: pick(['indigo', 'cyan', 'amber', 'green', 'purple', 'slate']),
      position: nthPosition(i),
    });

    const statusIds: string[] = [];
    for (const [j, column] of STATUS_COLUMNS.entries()) {
      const statusId = newId();
      statusIds.push(statusId);
      await db.insert(s.taskStatuses).values({
        id: statusId,
        organizationId: orgId,
        projectId,
        name: column.name,
        category: column.category,
        color: column.color,
        position: nthPosition(j),
      });
    }
    statusesByProject.set(projectId, statusIds);

    for (const userId of staff.slice(0, 4 + (i % 3))) {
      await db.insert(s.projectMembers).values({
        organizationId: orgId,
        projectId,
        userId,
        role: userId === owner ? 'owner' : 'member',
      });
    }

    await db.insert(s.milestones).values({
      organizationId: orgId,
      projectId,
      name: 'Phase one complete',
      dueDate: day(14 + i * 7),
    });

    // Sprints on the first project only, so the sprint UI has both a project
    // that uses them and projects that do not.
    if (i === 0) {
      sprintIds = await Promise.all(
        [
          { name: 'Sprint 24', start: -14, end: 0, done: true },
          { name: 'Sprint 25', start: 0, end: 14, done: false },
        ].map(async (sprint) => {
          const sprintId = newId();
          await db.insert(s.sprints).values({
            id: sprintId,
            organizationId: orgId,
            projectId,
            name: sprint.name,
            goal: 'Ship the navigation shell and token set.',
            startDate: day(sprint.start),
            endDate: day(sprint.end),
            completedAt: sprint.done ? at(sprint.end) : null,
          });
          return sprintId;
        }),
      );
    }
  }

  // --- Tasks --------------------------------------------------------------
  const taskIds: string[] = [];
  const taskByProject = new Map<string, string[]>();
  const counters = new Map<string, number>();

  for (const projectId of projectIds) {
    const statusIds = statusesByProject.get(projectId) as string[];
    const created: string[] = [];
    const perProject = 18 + Math.floor(random() * 5);

    for (let i = 0; i < perProject; i += 1) {
      const taskId = newId();
      const number = (counters.get(projectId) ?? 0) + 1;
      counters.set(projectId, number);

      const statusId = pick(statusIds);
      const isDone = statusId === statusIds[3];
      const title = pick(TASK_TITLES);

      await db.insert(s.tasks).values({
        id: taskId,
        organizationId: orgId,
        projectId,
        number,
        title,
        descriptionText: `${title}. Seeded demo content for the ${projectId.slice(0, 4)} project.`,
        statusId,
        priority: pick(['none', 'low', 'medium', 'high', 'urgent']),
        reporterId: pick(staff),
        sprintId: projectId === projectIds[0] && chance(0.6) ? pick(sprintIds) : null,
        startDate: chance(0.5) ? day(-20 + i) : null,
        dueDate: chance(0.7) ? day(-10 + i * 2) : null,
        estimateMinutes: chance(0.6) ? pick([30, 60, 120, 240, 480]) : null,
        completedAt: isDone ? at(-Math.floor(random() * 10)) : null,
        position: nthPosition(i),
      });

      created.push(taskId);
      taskIds.push(taskId);

      for (const userId of staff.slice(0, 1 + Math.floor(random() * 2))) {
        await db.insert(s.taskAssignees).values({ organizationId: orgId, taskId, userId });
      }
      if (chance(0.4)) {
        await db.insert(s.taskWatchers).values({
          organizationId: orgId,
          taskId,
          userId: pick(staff),
        });
      }
      if (chance(0.5)) {
        await db.insert(s.taskLabels).values({
          organizationId: orgId,
          taskId,
          labelId: pick(labelIds),
        });
      }

      // Subtasks - the thing the legacy app could not represent.
      if (chance(0.25)) {
        for (let k = 0; k < 2 + Math.floor(random() * 2); k += 1) {
          const childNumber = (counters.get(projectId) ?? 0) + 1;
          counters.set(projectId, childNumber);
          const childId = newId();

          await db.insert(s.tasks).values({
            id: childId,
            organizationId: orgId,
            projectId,
            parentTaskId: taskId,
            number: childNumber,
            title: `${title} - part ${k + 1}`,
            statusId: pick(statusIds),
            priority: 'medium',
            reporterId: pick(staff),
            position: nthPosition(k),
          });
          taskIds.push(childId);
        }
      }

      // Checklist
      if (chance(0.2)) {
        const checklistId = newId();
        await db.insert(s.checklists).values({
          id: checklistId,
          organizationId: orgId,
          taskId,
          title: 'Definition of done',
          position: nthPosition(0),
        });
        for (const [k, item] of ['Tests written', 'Reviewed', 'Deployed'].entries()) {
          await db.insert(s.checklistItems).values({
            organizationId: orgId,
            checklistId,
            title: item,
            isDone: k === 0,
            position: nthPosition(k),
          });
        }
      }
    }

    taskByProject.set(projectId, created);

    // Dependencies inside the project, always earlier -> later so the seed
    // cannot produce a cycle.
    for (let i = 2; i < created.length; i += 5) {
      await db.insert(s.taskDependencies).values({
        organizationId: orgId,
        taskId: created[i] as string,
        dependsOnTaskId: created[i - 2] as string,
        type: 'blocks',
      });
    }
  }

  // --- Comments, attachments, time -----------------------------------------
  const COMMENT_BODIES = [
    'Picked this up - should have something to show by Thursday.',
    'Blocked on the API contract. Raised it with the platform team.',
    'Client asked for a lighter treatment on the header.',
    'Moved to review. The edge case with empty results is handled.',
    'Estimate looks optimistic given the migration work underneath.',
  ];

  for (const taskId of taskIds.filter(() => chance(0.35))) {
    const authorId = pick(staff);
    const body = pick(COMMENT_BODIES);
    const commentId = newId();

    await db.insert(s.comments).values({
      id: commentId,
      organizationId: orgId,
      entityType: 'task',
      entityId: taskId,
      authorId,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }],
      },
      bodyText: body,
    });

    if (chance(0.3)) {
      const mentioned = pick(staff);
      await db.insert(s.mentions).values({
        organizationId: orgId,
        commentId,
        mentionedUserId: mentioned,
      });
      await db.insert(s.notifications).values({
        organizationId: orgId,
        userId: mentioned,
        kind: 'mention',
        title: `${PEOPLE[staff.indexOf(authorId)]?.name ?? 'Someone'} mentioned you`,
        body,
        entityType: 'task',
        entityId: taskId,
        actorId: authorId,
        readAt: chance(0.5) ? at(-1) : null,
      });
    }

    if (chance(0.15)) {
      await db.insert(s.attachments).values({
        organizationId: orgId,
        entityType: 'task',
        entityId: taskId,
        uploadedById: authorId,
        filename: pick(['brief.pdf', 'mockup.png', 'notes.md', 'export.csv']),
        mimeType: pick(['application/pdf', 'image/png', 'text/markdown', 'text/csv']),
        sizeBytes: 12_000 + Math.floor(random() * 900_000),
        storageKey: `${orgId}/${newId()}`,
        status: 'ready',
      });
    }
  }

  for (const taskId of taskIds.filter(() => chance(0.3))) {
    await db.insert(s.timeEntries).values({
      organizationId: orgId,
      userId: pick(staff),
      taskId,
      projectId: null,
      workDate: day(-Math.floor(random() * 21)),
      minutes: pick([15, 30, 45, 60, 90, 120, 180]),
      isBillable: chance(0.8),
      hourlyRate: '85.00',
      description: 'Seeded time entry',
    });
  }

  // --- Documents and channels ----------------------------------------------
  const DOCS = [
    { title: 'Team handbook', text: 'How we work, how we ship, and who owns what.' },
    { title: 'Northwind rebrand brief', text: 'Goals, audience, tone and deliverables.' },
    { title: 'Retro - Sprint 24', text: 'What went well, what did not, and what we change.' },
    { title: 'Release process', text: 'Cut a branch, run the gates, deploy, announce.' },
  ];
  for (const [i, doc] of DOCS.entries()) {
    await db.insert(s.documents).values({
      organizationId: orgId,
      spaceId: spaceIds[i % spaceIds.length] as string,
      title: doc.title,
      contentText: doc.text,
      createdById: pick(staff),
      position: nthPosition(i),
    });
  }

  for (const [i, projectId] of projectIds.slice(0, 3).entries()) {
    const channelId = newId();
    await db.insert(s.channels).values({
      id: channelId,
      organizationId: orgId,
      kind: 'project',
      name: PROJECT_BLUEPRINTS[i]?.key.toLowerCase() ?? `channel-${i}`,
      topic: 'Project chatter',
      projectId,
    });
    for (const userId of staff.slice(0, 5)) {
      await db.insert(s.channelMembers).values({ organizationId: orgId, channelId, userId });
    }
    for (let k = 0; k < 6; k += 1) {
      const text = pick([
        'Standup in 5.',
        'Staging is back up.',
        'Client call moved to Thursday.',
        'Anyone reviewing the token PR?',
        'Shipped. Watching errors.',
      ]);
      await db.insert(s.messages).values({
        organizationId: orgId,
        channelId,
        authorId: pick(staff),
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        bodyText: text,
      });
    }
  }

  // --- CRM -----------------------------------------------------------------
  const COMPANIES = ['Acme Industries', 'Vertex Labs', 'Bluefin Retail', 'Corvus Health'];
  const companyIds: string[] = [];
  for (const name of COMPANIES) {
    const companyId = newId();
    companyIds.push(companyId);
    await db.insert(s.companies).values({
      id: companyId,
      organizationId: orgId,
      name,
      domain: `${name.split(' ')[0]?.toLowerCase()}.test`,
      industry: pick(['Retail', 'Healthcare', 'Software', 'Logistics']),
      ownerId: pick(staff.slice(0, 5)),
      tags: ['seeded'],
    });
  }

  const contactIds: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const contactId = newId();
    contactIds.push(contactId);
    const first = pick(['Nadia', 'Peter', 'Rosa', 'Tom', 'Yuki', 'Omar', 'Lena', 'Sam']);
    await db.insert(s.contacts).values({
      id: contactId,
      organizationId: orgId,
      companyId: pick(companyIds),
      firstName: first,
      lastName: pick(['Ahmed', 'Novak', 'Silva', 'Klein', 'Tanaka']),
      email: `${first.toLowerCase()}${i}@client.test`,
      jobTitle: pick(['CTO', 'Head of Marketing', 'Product Owner', 'Founder']),
      source: pick(['referral', 'inbound', 'event', 'outbound']),
      ownerId: pick(staff.slice(0, 5)),
    });
  }

  const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost', 'qualified'] as const;
  for (const [i, stage] of STAGES.entries()) {
    await db.insert(s.deals).values({
      organizationId: orgId,
      companyId: pick(companyIds),
      contactId: pick(contactIds),
      name: `${pick(COMPANIES)} - ${pick(['website', 'platform', 'brand', 'retainer'])}`,
      stage,
      value: String(15_000 + i * 12_500),
      probability: stage === 'won' ? 100 : stage === 'lost' ? 0 : 20 + i * 15,
      expectedCloseDate: day(20 + i * 10),
      closedAt: stage === 'won' || stage === 'lost' ? at(-5) : null,
      lossReason: stage === 'lost' ? 'Budget moved to next year' : null,
      ownerId: pick(staff.slice(0, 5)),
      convertedProjectId: stage === 'won' ? (projectIds[1] as string) : null,
      position: nthPosition(i),
    });
  }

  // --- Finance --------------------------------------------------------------
  for (const [i, projectId] of projectIds.slice(0, 3).entries()) {
    await db.insert(s.projectBudgets).values({
      organizationId: orgId,
      projectId,
      companyId: companyIds[i] as string,
      rate: String(48_000 + i * 15_000),
      budget: String(52_000 + i * 15_000),
      hourlyRate: '85.00',
    });

    for (const [k, category] of ['Contractor', 'Software', 'Travel'].entries()) {
      await db.insert(s.projectCosts).values({
        organizationId: orgId,
        projectId,
        category,
        vendor: pick(['Upwork', 'Figma', 'Vercel', 'Neon']),
        description: `${category} spend`,
        amount: String(900 + k * 1_450 + i * 300),
        incurredOn: day(-30 + k * 7),
        createdById: pick(staff.slice(0, 3)),
      });
    }

    const invoiceId = newId();
    const subtotal = 12_000 + i * 4_000;
    await db.insert(s.invoices).values({
      id: invoiceId,
      organizationId: orgId,
      companyId: companyIds[i] as string,
      projectId,
      number: `INV-2026-${String(i + 1).padStart(4, '0')}`,
      status: (['paid', 'sent', 'draft'] as const)[i] ?? 'draft',
      issueDate: day(-20 + i * 5),
      dueDate: day(10 + i * 5),
      subtotal: String(subtotal),
      taxRate: '0.200',
      total: String(Math.round(subtotal * 1.2)),
      amountPaid: i === 0 ? String(Math.round(subtotal * 1.2)) : '0',
      paidAt: i === 0 ? at(-3) : null,
    });

    for (const [k, line] of ['Design sprint', 'Engineering', 'Project management'].entries()) {
      await db.insert(s.invoiceLines).values({
        organizationId: orgId,
        invoiceId,
        description: line,
        quantity: String(10 + k * 5),
        unitPrice: '85.00',
        amount: String((10 + k * 5) * 85),
        position: nthPosition(k),
      });
    }
  }

  // --- Goals ---------------------------------------------------------------
  for (const [i, name] of ['Grow recurring revenue', 'Improve delivery predictability'].entries()) {
    const goalId = newId();
    await db.insert(s.goals).values({
      id: goalId,
      organizationId: orgId,
      name,
      description: 'Seeded quarterly objective.',
      ownerId: pick(staff.slice(0, 3)),
      status: i === 0 ? 'on-track' : 'at-risk',
      confidence: i === 0 ? 80 : 45,
      periodStart: day(-45),
      periodEnd: day(45),
    });

    await db.insert(s.keyResults).values({
      organizationId: orgId,
      goalId,
      name: i === 0 ? 'Signed retainers' : 'On-time milestone rate',
      kind: i === 0 ? 'number' : 'percent',
      startValue: '2',
      targetValue: i === 0 ? '6' : '90',
      currentValue: i === 0 ? '4' : '68',
      linkedProjectId: projectIds[i] as string,
    });
  }

  // --- AI credits and an opening audit row ---------------------------------
  await db.insert(s.aiCredits).values({
    organizationId: orgId,
    periodStart: day(-15),
    periodEnd: day(15),
    limitUsd: '50.00',
    usedUsd: '3.482100',
  });

  await db.insert(s.activities).values({
    organizationId: orgId,
    actorId: owner,
    action: 'organization.seeded',
    entityType: 'space',
    entityId: spaceIds[0] as string,
    changes: { seed: { from: null, to: 'northwind' } },
  });

  return { organizationId: orgId, userIds, projectIds, taskIds };
}

/** CLI entry: `pnpm db:seed`. */
async function main() {
  config({ path: '../../apps/api/.env' });

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Fill apps/api/.env first.');
    process.exit(1);
  }

  const { createDatabase } = await import('./client.js');
  const db = createDatabase(url);
  const result = await seed(db);

  console.warn(
    `Seeded org ${result.organizationId}: ${result.userIds.length} users, ` +
      `${result.projectIds.length} projects, ${result.taskIds.length} tasks.`,
  );
  process.exit(0);
}

// Only run when invoked directly, not when imported by a test.
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  void main();
}
