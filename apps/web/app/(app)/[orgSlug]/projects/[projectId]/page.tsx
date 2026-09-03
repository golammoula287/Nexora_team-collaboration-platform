import { PageHeader, StatusDot } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/api.server';
import { SelectableBoard } from './selectable-board';
import { NewTaskButton } from './new-task-button';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { orgSlug, projectId } = await params;
  const api = await serverApi();

  const [projectResponse, tasksResponse, meResponse] = await Promise.all([
    api.orgs[':orgSlug'].projects[':projectId'].$get({ param: { orgSlug, projectId } }),
    api.orgs[':orgSlug'].tasks.$get({ param: { orgSlug }, query: { projectId } }),
    api.me.$get(),
  ]);

  // The API answers 404 both for "no such project" and "not yours", by design.
  if (!projectResponse.ok) notFound();

  const { project, statuses } = await projectResponse.json();
  const { tasks } = tasksResponse.ok ? await tasksResponse.json() : { tasks: [] };
  const { organizations } = meResponse.ok ? await meResponse.json() : { organizations: [] };

  const role = (organizations.find((org) => org.slug === orgSlug)?.role ?? 'member') as OrgRole;

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <span className="text-fg-subtle font-mono text-[13px]">{project.key}</span>
            <StatusDot
              tone={project.status === 'active' ? 'accent' : 'neutral'}
              label={project.status.replace('-', ' ')}
            />
            {/* Cosmetic: the API refuses regardless of what is rendered here. */}
            {can(role, 'create', 'task') ? (
              <NewTaskButton orgSlug={orgSlug} projectId={projectId} statuses={statuses} />
            ) : null}
          </div>
        }
      />

      <SelectableBoard
        orgSlug={orgSlug}
        columns={statuses}
        tasks={tasks}
        canDelete={can(role, 'delete', 'task')}
      />
    </div>
  );
}
