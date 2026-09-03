import { Card, CardContent, EmptyState, PageHeader, StatusDot } from '@nexora/ui';
import { FolderKanban } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Workspace overview. Phase 4 fills this with real projects and tasks; for now
 * it exists so the shell has something to frame and every state is visible.
 */
export default async function OrgHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="What is moving across the workspace this week." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Active projects', value: '—', tone: 'accent' as const },
          { label: 'Due this week', value: '—', tone: 'warning' as const },
          { label: 'Blocked', value: '—', tone: 'danger' as const },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="space-y-1 p-4 pt-4">
              <StatusDot tone={stat.tone} label={stat.label} />
              <p className="text-fg font-mono text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmptyState
        icon={<FolderKanban />}
        title="No projects yet"
        description="Projects, tasks and the board arrive in phase 4. The shell around them is ready."
        action={{ label: 'Browse projects', href: `/${orgSlug}/projects` }}
      />
    </div>
  );
}
