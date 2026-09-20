import { EmptyState, PageHeader } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import type { Metadata } from 'next';
import { serverApi } from '../../../../lib/api.server';
import { DocsWorkspace } from './docs-workspace';

export const metadata: Metadata = { title: 'Docs' };

export default async function DocsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const api = await serverApi();
  const [response, meResponse, spacesResponse, projectsResponse, templatesResponse] =
    await Promise.all([
      api.orgs[':orgSlug'].documents.$get({ param: { orgSlug } }),
      api.me.$get(),
      api.orgs[':orgSlug'].spaces.$get({ param: { orgSlug } }),
      api.orgs[':orgSlug'].projects.$get({ param: { orgSlug }, query: {} }),
      api.orgs[':orgSlug']['document-templates'].$get({ param: { orgSlug } }),
    ]);
  if (!response.ok || !meResponse.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Docs" />
        <EmptyState
          title="Docs could not be loaded"
          description="Refresh the page or check your workspace access."
        />
      </div>
    );
  }
  const { documents } = await response.json();
  const { organizations } = await meResponse.json();
  const { spaces } = spacesResponse.ok ? await spacesResponse.json() : { spaces: [] };
  const { projects } = projectsResponse.ok ? await projectsResponse.json() : { projects: [] };
  const { presets, custom } = templatesResponse.ok
    ? await templatesResponse.json()
    : { presets: [], custom: [] };
  const role = (organizations.find((org) => org.slug === orgSlug)?.role ?? 'guest') as OrgRole;
  return (
    <div className="space-y-6">
      <PageHeader title="Docs" description="Team knowledge and working notes" />
      <DocsWorkspace
        orgSlug={orgSlug}
        initialDocuments={documents}
        spaces={spaces}
        projects={projects}
        presets={presets}
        templates={custom}
        canCreate={can(role, 'create', 'document')}
        canSetWiki={can(role, 'update', 'space')}
      />
    </div>
  );
}
