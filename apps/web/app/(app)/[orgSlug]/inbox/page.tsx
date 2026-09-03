import { Badge, Card, EmptyState, PageHeader, StatusDot } from '@nexora/ui';
import { Inbox as InboxIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '../../../../lib/api.server';

export const metadata: Metadata = { title: 'My work' };

interface InboxTask {
  id: string;
  number: number;
  title: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  projectKey: string | null;
  statusName: string | null;
  statusCategory: string | null;
}

/**
 * My work: everything assigned to me across every project, grouped by when it
 * is due rather than by which project it belongs to.
 *
 * Grouping by date is the point of this screen. A person deciding what to do
 * next cares about "overdue, then today, then this week" - the project a task
 * belongs to is context, not the sort key.
 */
function bucketOf(task: InboxTask): string {
  if (task.completedAt) return 'Done';
  if (!task.dueDate) return 'No due date';

  const today = new Date().toISOString().slice(0, 10);
  if (task.dueDate < today) return 'Overdue';
  if (task.dueDate === today) return 'Today';

  const week = new Date();
  week.setUTCDate(week.getUTCDate() + 7);
  if (task.dueDate <= week.toISOString().slice(0, 10)) return 'This week';

  return 'Later';
}

const ORDER = ['Overdue', 'Today', 'This week', 'Later', 'No due date', 'Done'];

const TONE: Record<string, 'danger' | 'accent' | 'warning' | 'neutral' | 'success'> = {
  Overdue: 'danger',
  Today: 'accent',
  'This week': 'warning',
  Later: 'neutral',
  'No due date': 'neutral',
  Done: 'success',
};

export default async function InboxPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const api = await serverApi();

  const meResponse = await api.me.$get();
  if (!meResponse.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="My work" />
        <EmptyState title="Could not load your work" description="Try refreshing the page." />
      </div>
    );
  }

  const { user } = await meResponse.json();

  const tasksResponse = await api.orgs[':orgSlug'].tasks.$get({
    param: { orgSlug },
    // Filtered in the SQL by assignee, not fetched and narrowed here.
    query: { assigneeId: user.id, topLevelOnly: 'true' },
  });

  const { tasks } = tasksResponse.ok ? await tasksResponse.json() : { tasks: [] };

  const buckets = new Map<string, InboxTask[]>();
  for (const task of tasks as InboxTask[]) {
    const bucket = bucketOf(task);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), task]);
  }

  const open = tasks.filter((task) => !task.completedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My work"
        description={
          open === 0
            ? 'Nothing assigned to you right now.'
            : `${open} open task${open === 1 ? '' : 's'} assigned to you.`
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title="Nothing assigned to you"
          description="Tasks assigned to you appear here, grouped by when they are due."
        />
      ) : (
        ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => {
          const inBucket = buckets.get(bucket) ?? [];

          return (
            <section key={bucket} aria-labelledby={`bucket-${bucket}`} className="space-y-2">
              <h2 id={`bucket-${bucket}`} className="flex items-center gap-2">
                <StatusDot tone={TONE[bucket] ?? 'neutral'} label={bucket} />
                <Badge tone="neutral">{inBucket.length}</Badge>
              </h2>

              <Card>
                <ul className="divide-border divide-y">
                  {inBucket.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/${orgSlug}/tasks/${task.id}`}
                        className="hover:bg-surface-2 focus-visible:outline-ring flex flex-wrap items-center gap-x-3 gap-y-1 p-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
                      >
                        <span className="text-fg-subtle font-mono text-[11px]">
                          {task.projectKey}-{task.number}
                        </span>
                        <span className="text-fg min-w-0 flex-1 truncate text-[13px]">
                          {task.title}
                        </span>
                        {task.statusName ? <Badge tone="neutral">{task.statusName}</Badge> : null}
                        <span className="text-fg-muted font-mono text-[12px]">
                          {task.dueDate ?? '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}
