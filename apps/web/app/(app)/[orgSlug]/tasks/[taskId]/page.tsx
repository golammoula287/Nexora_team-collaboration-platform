import { Avatar, Badge, Card, CardContent, PageHeader, StatusDot } from '@nexora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/api.server';

export const metadata: Metadata = { title: 'Task' };

/** Renders one entry of the per-field change log in plain language. */
function describeChange(field: string, change: { from: unknown; to: unknown }): string {
  const format = (value: unknown) =>
    value === null || value === undefined || value === '' ? 'nothing' : String(value);

  if (field === 'title') return `renamed from "${format(change.from)}" to "${format(change.to)}"`;
  if (field === 'completedAt') {
    return change.to === null ? 'reopened' : 'marked complete';
  }
  return `${field}: ${format(change.from)} → ${format(change.to)}`;
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ orgSlug: string; taskId: string }>;
}) {
  const { orgSlug, taskId } = await params;
  const api = await serverApi();

  const response = await api.orgs[':orgSlug'].tasks[':taskId'].$get({
    param: { orgSlug, taskId },
  });

  if (!response.ok) notFound();

  const { task, subtasks, dependencies, assignees, history, blockedBySlipped } =
    await response.json();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={task.title}
        action={
          <div className="flex items-center gap-3">
            <span className="text-fg-subtle font-mono text-[13px]">#{task.number}</span>
            {task.priority !== 'none' ? <Badge tone="warning">{task.priority}</Badge> : null}
            <StatusDot
              tone={task.completedAt ? 'success' : 'neutral'}
              label={task.completedAt ? 'done' : 'open'}
            />
          </div>
        }
      />

      {blockedBySlipped ? (
        // The plan asks for a warning when a blocker slips past this task.
        <p
          role="status"
          className="border-warning/30 bg-warning-soft text-warning rounded-sm border px-3 py-2 text-[13px]"
        >
          A task blocking this one is due after it. This due date is unlikely to hold.
        </p>
      ) : null}

      {task.descriptionText ? (
        <Card>
          <CardContent className="p-4 pt-4">
            <p className="text-fg text-[13px] whitespace-pre-wrap">{task.descriptionText}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4 pt-4">
            <h2 className="text-fg text-[13px] font-medium">Assignees</h2>
            {assignees.length === 0 ? (
              <p className="text-fg-subtle text-[13px]">Nobody yet</p>
            ) : (
              <ul className="space-y-1.5">
                {assignees.map((assignee) => (
                  <li key={assignee.userId} className="flex items-center gap-2">
                    <Avatar name={assignee.name} src={assignee.image} size="sm" />
                    <span className="text-fg text-[13px]">{assignee.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4 pt-4">
            <h2 className="text-fg text-[13px] font-medium">Dates</h2>
            <dl className="space-y-1 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Start</dt>
                <dd className="text-fg font-mono">{task.startDate ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Due</dt>
                <dd className="text-fg font-mono">{task.dueDate ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Estimate</dt>
                <dd className="text-fg font-mono">
                  {task.estimateMinutes ? `${task.estimateMinutes}m` : '—'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="subtasks-heading" className="space-y-2">
        <h2 id="subtasks-heading" className="text-fg text-[16px] font-semibold">
          Subtasks ({subtasks.length})
        </h2>
        {subtasks.length === 0 ? (
          <p className="text-fg-subtle text-[13px]">None. Subtasks nest to any depth.</p>
        ) : (
          <Card>
            <ul className="divide-border divide-y">
              {subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <Link
                    href={`/${orgSlug}/tasks/${subtask.id}`}
                    className="hover:bg-surface-2 focus-visible:outline-ring flex items-center gap-3 p-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    <StatusDot
                      tone={subtask.completedAt ? 'success' : 'neutral'}
                      label=""
                      className="shrink-0"
                    />
                    <span className="text-fg-subtle font-mono text-[12px]">#{subtask.number}</span>
                    <span className="text-fg flex-1 truncate text-[13px]">{subtask.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="dependencies-heading" className="space-y-2">
        <h2 id="dependencies-heading" className="text-fg text-[16px] font-semibold">
          Dependencies ({dependencies.length})
        </h2>
        {dependencies.length === 0 ? (
          <p className="text-fg-subtle text-[13px]">
            None. Loops are refused when a dependency is added.
          </p>
        ) : (
          <Card>
            <ul className="divide-border divide-y">
              {dependencies.map((dependency) => (
                <li key={dependency.id} className="flex items-center gap-3 p-3">
                  <Badge tone="neutral">{dependency.type}</Badge>
                  <Link
                    href={`/${orgSlug}/tasks/${dependency.dependsOnTaskId}`}
                    className="text-fg flex-1 truncate text-[13px] hover:underline"
                  >
                    #{dependency.dependsOnNumber} {dependency.dependsOnTitle}
                  </Link>
                  {dependency.dependsOnCompletedAt ? (
                    <Badge tone="success">done</Badge>
                  ) : (
                    <Badge tone="warning">open</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="history-heading" className="space-y-2">
        <h2 id="history-heading" className="text-fg text-[16px] font-semibold">
          History
        </h2>
        <Card>
          <ul className="divide-border divide-y">
            {history.map((entry) => (
              <li key={entry.id} className="space-y-1 p-3">
                <p className="text-fg-muted text-[12px]">
                  {entry.actorName ?? 'Someone'} · {entry.action.replace('task.', '')}
                </p>
                {entry.changes
                  ? Object.entries(
                      entry.changes as Record<string, { from: unknown; to: unknown }>,
                    ).map(([field, change]) => (
                      <p key={field} className="text-fg text-[13px]">
                        {describeChange(field, change)}
                      </p>
                    ))
                  : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
