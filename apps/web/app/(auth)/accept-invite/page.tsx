import type { Metadata } from 'next';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata: Metadata = { title: 'Accept invitation' };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <AcceptInviteForm {...(id === undefined ? {} : { invitationId: id })} />;
}
