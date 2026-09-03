import { Badge, Card, CardContent, EmptyState, PageHeader, StatusDot } from '@nexora/ui';
import { ListTodo } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/api.server';

export const metadata: Metadata = { title: 'Project' };

/**
 * The project detail shell: header, board columns, and the empty state that
 * phase 4.2 fills with tasks.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { orgSlug, projectId } = await params;
  const api = await serverApi();

  const response = await api.orgs[':orgSlug'].projects[':projectId'].$get({
    param: { orgSlug, projectId },
  });

  // The API gives 404 both for "no such project" and "not yours", deliberately.
  if (!response.ok) notFound();

  const { project, statuses } = await response.json();

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <span className="text-fg-subtle font-mono text-[13px]">{project.key}</span>
            <StatusDot
              tone={project.status === 'active' ? 'accent' : 'neutral'}
              label={project.status.replace('-', ' ')}
            />
          </div>
        }
      />

      <section aria-labelledby="board-heading" className="space-y-3">
        <h2 id="board-heading" className="text-fg text-[16px] font-semibold">
          Board
        </h2>

        {/* Columns exist from creation; cards arrive in phase 4.2. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map((status) => (
            <Card key={status.id} className="bg-surface-2">
              <CardContent className="space-y-3 p-3 pt-3">
                <div className="flex items-center justify-between">
                  <StatusDot
                    tone={status.category === 'done' ? 'success' : 'neutral'}
                    label={status.name}
                  />
                  <Badge tone="neutral">0</Badge>
                </div>
                <p className="text-fg-subtle text-[12px]">No tasks yet</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <EmptyState
        icon={<ListTodo />}
        title="Tasks arrive in phase 4.2"
        description="The board, its columns and this project are real. Cards, drag-ordering and the other three views come next."
      />
    </div>
  );
}
