import { EmptyState, PageHeader } from '@nexora/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Preferences' };

export default function PreferencesPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <PageHeader title="Preferences" description="Theme, notifications and sessions." />
      <EmptyState
        title="Preferences arrive with notifications in phase 5"
        description="Theme can be changed from the account menu in the topbar today."
        action={{ label: 'Back to workspace', href: '/' }}
      />
    </main>
  );
}
