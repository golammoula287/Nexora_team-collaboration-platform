'use client';

import { Button, Card, CardContent, Spinner } from '@nexora/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authClient } from '../../../lib/auth-client';
import { withQuery } from '../../../lib/routes';

interface InvitationSummary {
  organizationName: string;
  role: string;
  email: string;
}

/**
 * Accepting an invitation.
 *
 * The invitation is looked up before anything is accepted, so the person can
 * see which workspace and which role they are being given. Accepting requires
 * a session, so an unauthenticated visitor is sent to sign in and returned here.
 */
export function AcceptInviteForm({ invitationId }: { invitationId?: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationSummary | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      setError('That invitation link is incomplete.');
      setLoading(false);
      return;
    }

    void (async () => {
      const { data, error: lookupError } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });

      if (lookupError || !data) {
        setError(
          lookupError?.message ??
            'That invitation is no longer valid. It may have expired or been revoked.',
        );
      } else {
        setInvitation({
          organizationName: data.organizationName,
          role: data.role,
          email: data.email,
        });
      }
      setLoading(false);
    })();
  }, [invitationId]);

  async function accept() {
    if (!invitationId) return;
    setAccepting(true);
    setError(undefined);

    const { data, error: acceptError } = await authClient.organization.acceptInvitation({
      invitationId,
    });

    if (acceptError || !data) {
      // Most often: not signed in, or signed in as a different person.
      setError(acceptError?.message ?? 'Could not accept that invitation.');
      setAccepting(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8">
          <Spinner label="Loading invitation" />
          <span className="text-fg-muted text-[13px]">Checking your invitation…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !invitation) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6 pt-6 text-center">
          <h1 className="text-fg text-[16px] font-semibold">Invitation unavailable</h1>
          <p role="alert" className="text-fg-muted text-[13px]">
            {error}
          </p>
          <Button variant="secondary" asChild>
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6 pt-6">
        <div className="space-y-1">
          <h1 className="text-fg text-xl font-semibold tracking-tight">
            Join {invitation.organizationName}
          </h1>
          <p className="text-fg-muted text-[13px]">
            You have been invited as a{' '}
            <span className="text-fg font-medium">{invitation.role}</span>.
          </p>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={accept}
          disabled={accepting}
          aria-busy={accepting}
        >
          {accepting ? <Spinner label="Accepting invitation" /> : null}
          {accepting ? 'Joining…' : 'Accept invitation'}
        </Button>

        <p className="text-fg-muted text-center text-[13px]">
          Not signed in as {invitation.email}?{' '}
          <Link
            href={withQuery('/sign-in', {
              next: `/accept-invite?id=${invitationId ?? ''}`,
            })}
            className="text-accent font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
