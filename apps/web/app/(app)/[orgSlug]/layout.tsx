import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/layout/app-shell';
import { serverApi } from '../../../lib/api.server';
import { withQuery } from '../../../lib/routes';

/**
 * The org-scoped shell.
 *
 * Membership is resolved by the API, not here - `proxy.ts` only checked that a
 * cookie exists. A 401 means sign in; a 404 means this person is not a member,
 * and the API deliberately does not distinguish that from "no such org".
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const api = await serverApi();

  const response = await api.me.$get();

  if (response.status === 401) {
    redirect(withQuery('/sign-in', { next: `/${orgSlug}` }));
  }
  if (!response.ok) {
    notFound();
  }

  const { user, organizations } = await response.json();

  if (!organizations.some((org) => org.slug === orgSlug)) {
    notFound();
  }

  return (
    <AppShell
      orgSlug={orgSlug}
      organizations={organizations}
      user={user}
      breadcrumbs={[{ label: organizations.find((o) => o.slug === orgSlug)?.name ?? orgSlug }]}
    >
      {children}
    </AppShell>
  );
}
