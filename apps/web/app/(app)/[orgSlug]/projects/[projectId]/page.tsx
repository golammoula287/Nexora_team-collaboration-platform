import { PageHeader, StatusDot } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/api.server';
import { ColumnsEditor } from './columns-editor';
import { NewTaskButton } from './new-task-button';
import { ProjectActions } from './project-actions';
import { ProjectViews } from './views/project-views';
import type { SavedView } from './views/saved-views';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
  /** `?view=<shareToken>` opens someone's shared view. */
  searchParams: Promise<{ view?: string }>;
}) {
  const { orgSlug, projectId } = await params;
  const { view: shareToken } = await searchParams;
  const api = await serverApi();

  const [projectResponse, tasksResponse, dependencyResponse, meResponse, viewsResponse] =
    await Promise.all([
      api.orgs[':orgSlug'].projects[':projectId'].$get({ param: { orgSlug, projectId } }),
      api.orgs[':orgSlug'].tasks.$get({ param: { orgSlug }, query: { projectId } }),
      api.orgs[':orgSlug'].projects[':projectId'].dependencies.$get({
        param: { orgSlug, projectId },
      }),
      api.me.$get(),
      api.orgs[':orgSlug'].views.$get({ param: { orgSlug }, query: { projectId } }),
    ]);

  // The API answers 404 both for "no such project" and "not yours", by design.
  if (!projectResponse.ok) notFound();

  const { project, statuses } = await projectResponse.json();
  const { tasks } = tasksResponse.ok ? await tasksResponse.json() : { tasks: [] };
  const { dependencies } = dependencyResponse.ok
    ? await dependencyResponse.json()
    : { dependencies: [] };
  const { views } = viewsResponse.ok ? await viewsResponse.json() : { views: [] };
  const me = meResponse.ok ? await meResponse.json() : null;

  const role = (me?.organizations.find((org) => org.slug === orgSlug)?.role ?? 'member') as OrgRole;

  const savedViews = views as SavedView[];

  /*
   * A shared link names a view; it is not a key to the data behind it. This
   * still runs behind the session and org middleware, so a token from another
   * workspace resolves to nothing here.
   */
  let initialView: SavedView | null = null;
  if (shareToken) {
    const shared = await api.orgs[':orgSlug'].views.shared[':shareToken'].$get({
      param: { orgSlug, shareToken },
    });
    if (shared.ok) initialView = ((await shared.json()) as { view: SavedView }).view;
  }
  initialView ??= savedViews.find((saved) => saved.isDefault) ?? null;

  // Card counts per column, so the column editor can say what a delete will move.
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.statusId) counts[task.statusId] = (counts[task.statusId] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-fg-subtle font-mono text-[13px]">{project.key}</span>
            <StatusDot
              tone={project.status === 'active' ? 'accent' : 'neutral'}
              label={project.status.replace('-', ' ')}
            />
            {/* Cosmetic: the API refuses regardless of what is rendered here. */}
            {can(role, 'update', 'project') ? (
              <ColumnsEditor
                orgSlug={orgSlug}
                projectId={projectId}
                columns={statuses}
                counts={counts}
              />
            ) : null}
            {can(role, 'create', 'task') ? (
              <NewTaskButton orgSlug={orgSlug} projectId={projectId} statuses={statuses} />
            ) : null}
            {can(role, 'create', 'project') ? (
              <ProjectActions
                orgSlug={orgSlug}
                projectId={projectId}
                projectName={project.name}
              />
            ) : null}
          </div>
        }
      />

      <ProjectViews
        orgSlug={orgSlug}
        projectId={projectId}
        columns={statuses}
        tasks={tasks}
        dependencies={dependencies}
        savedViews={savedViews}
        currentUserId={me?.user.id ?? ''}
        initialView={initialView}
        canDelete={can(role, 'delete', 'task')}
      />
    </div>
  );
}
