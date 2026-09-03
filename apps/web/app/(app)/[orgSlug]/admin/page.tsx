import { EmptyState, PageHeader } from '@nexora/ui';
import { can, type OrgRole } from '@nexora/shared';
import type { Metadata } from 'next';

import { serverApi } from '../../../../lib/api.server';
import { MembersAdmin } from './members-admin';

export const metadata: Metadata = { title: 'Members' };

/**
 * Members administration.
 *
 * Everything here is fetched through the API, which re-checks the caller's
 * role on every route. What this page decides is only what to render - a
 * hidden button is a courtesy, never a control.
 */
export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const api = await serverApi();

  const [meResponse, membersResponse] = await Promise.all([
    api.me.$get(),
    api.orgs[':orgSlug'].members.$get({ param: { orgSlug } }),
  ]);

  if (!meResponse.ok || !membersResponse.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Members" />
        <EmptyState
          title="You cannot manage members here"
          description="Ask an owner or admin of this workspace for access."
        />
      </div>
    );
  }

  const { user, organizations } = await meResponse.json();
  const { members } = await membersResponse.json();

  const role = (organizations.find((org) => org.slug === orgSlug)?.role ?? 'member') as OrgRole;
  const canInvite = can(role, 'invite', 'member');
  const canSetRole = can(role, 'set-role', 'member');

  // Only fetched when it will be shown; the route requires the invite
  // permission and would 403 for anyone else.
  const invitations = canInvite
    ? await api.orgs[':orgSlug'].invitations
        .$get({ param: { orgSlug } })
        .then(async (response) => (response.ok ? (await response.json()).invitations : []))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Who can reach this workspace, and what they can do in it."
      />

      <MembersAdmin
        orgSlug={orgSlug}
        currentUserId={user.id}
        currentRole={role}
        members={members}
        invitations={invitations}
        canInvite={canInvite}
        canSetRole={canSetRole}
      />
    </div>
  );
}
