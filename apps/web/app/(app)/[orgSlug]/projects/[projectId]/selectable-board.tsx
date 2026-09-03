'use client';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  StatusDot,
  Spinner,
  cn,
} from '@nexora/ui';
import { TASK_PRIORITIES } from '@nexora/shared';
import { Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';
import type { BoardColumn, BoardTask } from './board';

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

function isOverdue(dueDate: string | null, completedAt: string | null): boolean {
  if (!dueDate || completedAt) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

/**
 * The board, with multi-select.
 *
 * Selection lives here rather than in a URL or a store: it is transient, it
 * never needs to survive a reload, and putting it in state keeps the action bar
 * and the checkboxes from disagreeing.
 *
 * Dragging is 4.4. The move endpoint and the ordering keys already exist.
 */
export function SelectableBoard({
  orgSlug,
  columns,
  tasks,
  canDelete,
}: {
  orgSlug: string;
  columns: BoardColumn[];
  tasks: BoardTask[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const cards = tasks.filter((task) => task.parentTaskId === null);

  function toggle(taskId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function applyPatch(patch: Record<string, unknown>, message: string) {
    setPending(true);
    const response = await api.orgs[':orgSlug'].tasks.bulk.$post({
      param: { orgSlug },
      json: { taskIds: [...selected], patch },
    });
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      toast.error(body.error?.message ?? 'Could not update those tasks.');
      return;
    }

    toast.success(message);
    setSelected(new Set());
    router.refresh();
  }

  async function deleteSelected() {
    setPending(true);
    const response = await api.orgs[':orgSlug'].tasks['bulk-delete'].$post({
      param: { orgSlug },
      json: { taskIds: [...selected] },
    });
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      toast.error(body.error?.message ?? 'Could not delete those tasks.');
      return;
    }

    const { deleted } = await response.json();
    // Soft delete, so the toast can honestly promise it is recoverable.
    toast.success(`${deleted} task${deleted === 1 ? '' : 's'} moved to Trash`, {
      action: {
        label: 'Open Trash',
        onClick: () => router.push(`/${orgSlug}/trash`),
      },
    });
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="border-border bg-surface shadow-pop sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border p-2"
        >
          <span className="text-fg px-1 text-[13px] font-medium">{selected.size} selected</span>

          <select
            aria-label="Set priority for the selected tasks"
            defaultValue=""
            disabled={pending}
            onChange={(event) => {
              if (event.target.value) {
                void applyPatch({ priority: event.target.value }, 'Priority updated');
                event.target.value = '';
              }
            }}
            className="border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2"
          >
            <option value="" disabled>
              Set priority…
            </option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>

          <select
            aria-label="Move the selected tasks to a column"
            defaultValue=""
            disabled={pending}
            onChange={(event) => {
              if (event.target.value) {
                void applyPatch({ statusId: event.target.value }, 'Tasks moved');
                event.target.value = '';
              }
            }}
            className="border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2"
          >
            <option value="" disabled>
              Move to…
            </option>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>

          {canDelete ? (
            <Button variant="danger" size="sm" onClick={deleteSelected} disabled={pending}>
              {pending ? <Spinner label="Working" /> : <Trash2 aria-hidden="true" />}
              Delete
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => {
          const inColumn = cards.filter((task) => task.statusId === column.id);

          return (
            <section
              key={column.id}
              aria-labelledby={`column-${column.id}`}
              className="border-border bg-surface-2 flex flex-col gap-2 rounded-md border p-2"
            >
              <div className="flex items-center justify-between px-1 pt-1">
                <h3 id={`column-${column.id}`}>
                  <StatusDot
                    tone={column.category === 'done' ? 'success' : 'neutral'}
                    label={column.name}
                  />
                </h3>
                <Badge tone="neutral">{inColumn.length}</Badge>
              </div>

              {inColumn.length === 0 ? (
                <p className="text-fg-subtle px-1 pb-2 text-[12px]">Nothing here</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {inColumn.map((task) => {
                    const overdue = isOverdue(task.dueDate, task.completedAt);
                    const isSelected = selected.has(task.id);

                    return (
                      <li key={task.id}>
                        <Card
                          className={cn(
                            'transition-colors',
                            isSelected
                              ? 'border-accent ring-accent/30 ring-2'
                              : 'hover:border-border-strong',
                          )}
                        >
                          <CardContent className="space-y-2 p-3 pt-3">
                            <div className="flex items-start gap-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggle(task.id)}
                                aria-label={`Select ${task.title}`}
                                className="mt-0.5"
                              />
                              <Link
                                href={`/${orgSlug}/tasks/${task.id}`}
                                className="focus-visible:outline-ring text-fg flex-1 text-[13px] leading-snug focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {task.title}
                              </Link>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pl-6">
                              <span className="text-fg-subtle font-mono text-[11px]">
                                {task.projectKey}-{task.number}
                              </span>

                              {task.priority !== 'none' ? (
                                <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>
                                  {task.priority}
                                </Badge>
                              ) : null}

                              {task.dueDate ? (
                                <span
                                  className={`text-[11px] ${overdue ? 'text-danger font-medium' : 'text-fg-muted'}`}
                                >
                                  {overdue ? 'Overdue ' : ''}
                                  {task.dueDate}
                                </span>
                              ) : null}

                              <span className="ml-auto flex -space-x-1">
                                {task.assignees.slice(0, 3).map((assignee) => (
                                  <Avatar
                                    key={assignee.userId}
                                    name={assignee.name}
                                    src={assignee.image}
                                    size="sm"
                                    className="ring-surface ring-2"
                                  />
                                ))}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
