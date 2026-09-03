import { EmptyState, PageHeader } from '@nexora/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'New organization' };

export default function NewOrganizationPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <PageHeader title="New organization" description="Create a workspace for your team." />
      <EmptyState
        title="Organization creation is phase 2 follow-up"
        description="Better Auth's organization plugin is wired; this form is not built yet."
        action={{ label: 'Back', href: '/' }}
      />
    </main>
  );
}
