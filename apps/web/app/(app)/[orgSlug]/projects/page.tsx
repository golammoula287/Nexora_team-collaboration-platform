import { EmptyState, PageHeader } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import { FolderKanban } from 'lucide-react';
import type { Metadata } from 'next';
import { serverApi } from '../../../../lib/api.server';
import { NewProjectButton } from './new-project-button';
import { ProjectList } from './project-list';

export const metadata: Metadata = { title: 'Projects' };

/**
 * The project list.
 *
 * A Server Component: it fetches through the typed client with the cookie
 * forwarded, and hands plain data to the interactive pieces. Whether the
 * "New project" button appears is decided here from the caller's role, which
 * is cosmetic - the API refuses regardless.
 */
export default async function ProjectsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const api = await serverApi();

  const [meResponse, projectsResponse, spacesResponse] = await Promise.all([
    api.me.$get(),
    api.orgs[':orgSlug'].projects.$get({ param: { orgSlug }, query: {} }),
    api.orgs[':orgSlug'].spaces.$get({ param: { orgSlug } }),
  ]);

  if (!meResponse.ok || !projectsResponse.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Projects" />
        <EmptyState
          title="Projects could not be loaded"
          description="Refresh the page, or check that you still have access to this workspace."
        />
      </div>
    );
  }

  const { organizations } = await meResponse.json();
  const { projects } = await projectsResponse.json();
  const { spaces } = spacesResponse.ok ? await spacesResponse.json() : { spaces: [] };

  const role = (organizations.find((org) => org.slug === orgSlug)?.role ?? 'member') as OrgRole;
  const canCreate = can(role, 'create', 'project');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={
          projects.length === 1 ? '1 project' : `${projects.length} projects in this workspace`
        }
        action={canCreate ? <NewProjectButton orgSlug={orgSlug} spaces={spaces} /> : undefined}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          description={
            canCreate
              ? 'Create one to get a board, a backlog and a place for the work to live.'
              : 'Someone with permission can create the first one.'
          }
        />
      ) : (
        <ProjectList orgSlug={orgSlug} projects={projects} />
      )}
    </div>
  );
}
