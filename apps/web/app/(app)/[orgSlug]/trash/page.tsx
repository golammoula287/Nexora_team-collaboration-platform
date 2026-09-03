import { EmptyState, PageHeader } from '@nexora/ui';
import { Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { serverApi } from '../../../../lib/api.server';
import { TrashList } from './trash-list';

export const metadata: Metadata = { title: 'Trash' };

/**
 * Trash.
 *
 * Nothing here has been removed - these rows carry a `deletedAt` and are hidden
 * everywhere else. The cleanup job that eventually removes them is phase 5; for
 * now the retention countdown is a promise the UI can keep.
 */
export default async function TrashPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const api = await serverApi();

  const response = await api.orgs[':orgSlug'].trash.tasks.$get({ param: { orgSlug } });

  if (!response.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trash" />
        <EmptyState
          title="You cannot see the Trash for this workspace"
          description="Deleting and restoring are manager-level actions. Ask an admin if you need access."
        />
      </div>
    );
  }

  const { tasks } = await response.json();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description="Deleted tasks are kept for 30 days, then removed. Restoring brings subtasks back too."
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<Trash2 />}
          title="Trash is empty"
          description="Deleted tasks appear here with how long is left before they are removed."
        />
      ) : (
        <TrashList orgSlug={orgSlug} tasks={tasks} />
      )}
    </div>
  );
}
