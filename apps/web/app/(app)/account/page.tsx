import { EmptyState, PageHeader } from '@nexora/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Profile' };

export default function AccountPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <PageHeader title="Profile" description="Your name, avatar, timezone and locale." />
      <EmptyState
        title="Profile editing arrives with the settings screens"
        description="The fields exist on the user record already; the form is phase 3 follow-up work."
        action={{ label: 'Back to workspace', href: '/' }}
      />
    </main>
  );
}
