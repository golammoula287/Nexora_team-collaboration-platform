import { Avatar, Badge, Card, CardContent, StatusDot } from '@nexora/ui';
import Link from 'next/link';

export interface BoardTask {
  id: string;
  number: number;
  title: string;
  priority: string;
  statusId: string | null;
  projectKey: string | null;
  dueDate: string | null;
  completedAt: string | null;
  parentTaskId: string | null;
  assignees: { userId: string; name: string; image: string | null }[];
}

export interface BoardColumn {
  id: string;
  name: string;
  category: string;
}

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
 * The board.
 *
 * Read-only for now: cards render in their columns in fractional-index order.
 * Dragging is 4.4, and it will move one card by writing one row - the ordering
 * keys are already in place for it.
 */
export function Board({
  orgSlug,
  columns,
  tasks,
}: {
  orgSlug: string;
  columns: BoardColumn[];
  tasks: BoardTask[];
}) {
  // Only top-level tasks appear as cards; subtasks belong to their parent.
  const cards = tasks.filter((task) => task.parentTaskId === null);

  return (
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

                  return (
                    <li key={task.id}>
                      <Card className="hover:border-border-strong transition-colors">
                        <Link
                          href={`/${orgSlug}/tasks/${task.id}`}
                          className="focus-visible:outline-ring block focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <CardContent className="space-y-2 p-3 pt-3">
                            <p className="text-fg text-[13px] leading-snug">{task.title}</p>

                            <div className="flex flex-wrap items-center gap-2">
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
                        </Link>
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
  );
}
