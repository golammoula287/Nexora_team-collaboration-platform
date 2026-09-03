import { EmptyState, PageHeader } from '@nexora/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reports' };

/** Placeholder route so the shell's navigation is complete and testable. */
export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Built in a later phase." />
      <EmptyState
        title="Nothing here yet"
        description="This section is part of a later phase. The route, layout and states exist so the shell can be walked end to end."
      />
    </div>
  );
}
