'use client';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '@nexora/ui';
import { ORG_ROLES, inviteMemberSchema, type OrgRole } from '@nexora/shared';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { authClient } from '../../../../lib/auth-client';
import { api } from '../../../../lib/api';

export interface MemberRow {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; image: string | null };
}

export interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
}

/**
 * Ranking, mirrored from the matrix so the UI hides what the API would refuse.
 * An unknown role ranks 0, which makes every comparison against it false -
 * denying rather than throwing, exactly as `can()` does.
 */
const RANK: Record<string, number> = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };

function rank(role: string): number {
  return RANK[role] ?? 0;
}

export function MembersAdmin({
  orgSlug,
  currentUserId,
  currentRole,
  members,
  invitations,
  canInvite,
  canSetRole,
}: {
  orgSlug: string;
  currentUserId: string;
  currentRole: OrgRole;
  members: MemberRow[];
  invitations: InvitationRow[];
  canInvite: boolean;
  canSetRole: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [inviteError, setInviteError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(undefined);

    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setInviteError(parsed.error.issues[0]?.message ?? 'Check the address.');
      return;
    }

    setPending(true);
    const { error } = await authClient.organization.inviteMember({
      email: parsed.data.email,
      role: parsed.data.role,
      organizationId: undefined,
    });

    if (error) {
      setInviteError(error.message ?? 'Could not send that invitation.');
      setPending(false);
      return;
    }

    toast.success(`Invitation sent to ${parsed.data.email}`);
    setEmail('');
    setPending(false);
    router.refresh();
  }

  async function changeRole(memberId: string, nextRole: OrgRole) {
    setBusyMember(memberId);

    // Our route, not Better Auth's: it enforces that the actor strictly
    // outranks the target, and writes the audit row.
    const response = await api.orgs[':orgSlug'].members[':memberId'].role.$patch({
      param: { orgSlug, memberId },
      json: { role: nextRole },
    });

    setBusyMember(null);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      toast.error(body.error?.message ?? 'Could not change that role.');
      return;
    }

    toast.success('Role updated');
    router.refresh();
  }

  async function remove(memberId: string, name: string) {
    setBusyMember(memberId);

    const response = await api.orgs[':orgSlug'].members[':memberId'].$delete({
      param: { orgSlug, memberId },
    });

    setBusyMember(null);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      toast.error(body.error?.message ?? 'Could not remove that person.');
      return;
    }

    toast.success(`${name} removed from the workspace`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canInvite ? (
        <Card>
          <CardContent className="p-4 pt-4">
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3" noValidate>
              <Field label="Invite by email" error={inviteError} className="min-w-[220px] flex-1">
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    name="email"
                    placeholder="teammate@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Role" className="w-[140px]">
                {(props) => (
                  <select
                    {...props}
                    value={role}
                    onChange={(event) => setRole(event.target.value as OrgRole)}
                    className="border-border bg-surface text-fg focus-visible:outline-ring h-[34px] w-full rounded-sm border px-2 text-[13px] focus-visible:outline-2"
                  >
                    {ORG_ROLES.filter((r) => rank(r) <= rank(currentRole)).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
                {pending ? <Spinner label="Sending invitation" /> : null}
                Send invitation
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="text-fg text-[16px] font-semibold">
          Members ({members.length})
        </h2>

        <Card>
          <ul className="divide-border divide-y">
            {members.map((member) => {
              const isSelf = member.user.id === currentUserId;
              const canActOnThem = canSetRole && !isSelf && rank(currentRole) > rank(member.role);

              return (
                <li key={member.id} className="flex items-center gap-3 p-3">
                  <Avatar name={member.user.name} src={member.user.image} size="md" />

                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate text-[13px] font-medium">
                      {member.user.name}
                      {isSelf ? <span className="text-fg-subtle"> (you)</span> : null}
                    </p>
                    <p className="text-fg-muted truncate text-[12px]">{member.user.email}</p>
                  </div>

                  <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>{member.role}</Badge>

                  {canActOnThem ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Manage ${member.user.name}`}
                          disabled={busyMember === member.id}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Change role</DropdownMenuLabel>
                        {ORG_ROLES.filter(
                          (r) => rank(r) <= rank(currentRole) && r !== member.role,
                        ).map((r) => (
                          <DropdownMenuItem key={r} onSelect={() => changeRole(member.id, r)}>
                            Make {r}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          onSelect={() => remove(member.id, member.user.name)}
                        >
                          Remove from workspace
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    // Keeps the row heights aligned without an inert button in
                    // the tab order.
                    <span className="size-8" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {canInvite ? (
        <section aria-labelledby="invitations-heading" className="space-y-3">
          <h2 id="invitations-heading" className="text-fg text-[16px] font-semibold">
            Pending invitations
          </h2>

          {invitations.length === 0 ? (
            <EmptyState
              title="No pending invitations"
              description="Invitations you send appear here until they are accepted."
            />
          ) : (
            <Card>
              <ul className="divide-border divide-y">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-fg truncate text-[13px]">{invitation.email}</p>
                      <p className="text-fg-muted text-[12px]">
                        Invited as {invitation.role} · {invitation.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
