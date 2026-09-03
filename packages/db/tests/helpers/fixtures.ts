import { newId } from '../../src/ids.js';
import * as s from '../../src/schema/index.js';
import type { AnyDatabase } from '../../src/client.js';

/**
 * Two organizations with identical-looking data. Every isolation test asks the
 * same question: can org A see anything belonging to org B?
 */
export interface TwoOrgs {
  orgA: { id: string; userId: string; projectId: string; taskId: string };
  orgB: { id: string; userId: string; projectId: string; taskId: string };
}

async function createOrg(db: AnyDatabase, label: string, position: string) {
  const orgId = newId();
  const userId = newId();
  const spaceId = newId();
  const projectId = newId();
  const taskId = newId();

  await db.insert(s.organization).values({
    id: orgId,
    name: `Org ${label}`,
    slug: `org-${label.toLowerCase()}`,
  });

  await db.insert(s.user).values({
    id: userId,
    name: `User ${label}`,
    email: `user-${label.toLowerCase()}@example.test`,
  });

  await db.insert(s.member).values({
    organizationId: orgId,
    userId,
    role: 'owner',
  });

  await db.insert(s.spaces).values({
    id: spaceId,
    organizationId: orgId,
    name: `Space ${label}`,
    slug: 'default',
    position,
  });

  await db.insert(s.projects).values({
    id: projectId,
    organizationId: orgId,
    spaceId,
    name: `Project ${label}`,
    key: `PRJ${label}`,
    ownerId: userId,
    position,
  });

  await db.insert(s.tasks).values({
    id: taskId,
    organizationId: orgId,
    projectId,
    number: 1,
    // Deliberately identical across orgs: a leak cannot hide behind a
    // difference in the data.
    title: 'Confidential roadmap item',
    reporterId: userId,
    position,
  });

  return { id: orgId, userId, projectId, taskId };
}

export async function seedTwoOrgs(db: AnyDatabase): Promise<TwoOrgs> {
  return {
    orgA: await createOrg(db, 'A', 'a0'),
    orgB: await createOrg(db, 'B', 'a0'),
  };
}
