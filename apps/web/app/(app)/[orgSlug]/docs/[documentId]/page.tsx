import { EmptyState, PageHeader } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import type { Metadata } from 'next';
import { serverApi } from '../../../../../lib/api.server';
import { RealtimeDocument } from './realtime-document';

export const metadata: Metadata = { title: 'Document' };

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ orgSlug: string; documentId: string }>;
}) {
  const { orgSlug, documentId } = await params;
  const api = await serverApi();
  const [response, meResponse, membersResponse] = await Promise.all([
    api.orgs[':orgSlug'].documents[':documentId'].$get({ param: { orgSlug, documentId } }),
    api.me.$get(),
    api.orgs[':orgSlug'].members.$get({ param: { orgSlug } }),
  ]);
  if (!response.ok || !meResponse.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Document" />
        <EmptyState
          title="Document unavailable"
          description="It may have been removed, or you may no longer have access."
        />
      </div>
    );
  const { document } = await response.json();
  const { organizations, user } = await meResponse.json();
  const { members } = membersResponse.ok ? await membersResponse.json() : { members: [] };
  const role = (organizations.find((org) => org.slug === orgSlug)?.role ?? 'guest') as OrgRole;
  return (
    <RealtimeDocument
      orgSlug={orgSlug}
      document={document}
      canEdit={can(role, 'update', 'document')}
      members={members.map((member) => ({ id: member.user.id, label: member.user.name }))}
      organizationId={organizations.find((org) => org.slug === orgSlug)?.id ?? ''}
      userId={user.id}
      userName={user.name}
    />
  );
}
