'use client';

import { Card, EmptyState, cn } from '@nexora/ui';
import Link from 'next/link';
import { useMemo } from 'react';
import { PRIORITY_TONE, isOverdue, parseDate, type ViewTask } from './shared';

const DAY = 86_400_000;

export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

/**
 * Timeline (Gantt), with dependency lines.
 *
 * The bars are positioned as percentages of the visible range, so the chart
 * reflows at any width instead of needing a fixed pixel canvas. The dependency
 * lines are drawn in one SVG overlay behind the rows.
 *
 * The chart is decorative for a screen reader - `aria-hidden` on the SVG - and
 * every row is also a labelled link stating its own dates, so the information
 * is available without seeing the picture.
 */
export function TimelineView({
  orgSlug,
  tasks,
  dependencies,
}: {
  orgSlug: string;
  tasks: ViewTask[];
  dependencies: DependencyEdge[];
}) {
  const scheduled = tasks.filter(
    (task) => task.parentTaskId === null && (task.startDate || task.dueDate),
  );

  const range = useMemo(() => {
    if (scheduled.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const task of scheduled) {
      const start = parseDate(task.startDate ?? (task.dueDate as string)).getTime();
      const end = parseDate(task.dueDate ?? (task.startDate as string)).getTime();
      min = Math.min(min, start);
      max = Math.max(max, end);
    }

    // A few days of padding so bars at the edges are not flush with the border.
    return { start: min - 2 * DAY, end: max + 2 * DAY };
  }, [scheduled]);

  const rows = useMemo(() => {
    if (!range) return [];
    const span = range.end - range.start;

    return scheduled.map((task, index) => {
      const start = parseDate(task.startDate ?? (task.dueDate as string)).getTime();
      const end = parseDate(task.dueDate ?? (task.startDate as string)).getTime();

      return {
        task,
        index,
        left: ((start - range.start) / span) * 100,
        // A single-day task would otherwise be invisible.
        width: Math.max(((end - start) / span) * 100, 1.5),
      };
    });
  }, [scheduled, range]);

  if (!range || rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to plot yet"
        description="Tasks appear on the timeline once they have a start or a due date."
      />
    );
  }

  const rowHeight = 36;
  const byId = new Map(rows.map((row) => [row.task.id, row]));

  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[640px] p-4">
        <div className="relative" style={{ height: rows.length * rowHeight }}>
          {/* Dependency lines, behind the bars. Decorative: the same
              relationships are listed on each task's own page. */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            {dependencies.map((edge) => {
              const from = byId.get(edge.dependsOnTaskId);
              const to = byId.get(edge.taskId);
              if (!from || !to) return null;

              const fromY = from.index * rowHeight + rowHeight / 2;
              const toY = to.index * rowHeight + rowHeight / 2;

              return (
                <line
                  key={`${edge.taskId}-${edge.dependsOnTaskId}`}
                  x1={`${from.left + from.width}%`}
                  y1={fromY}
                  x2={`${to.left}%`}
                  y2={toY}
                  stroke="var(--border-strong)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              );
            })}
          </svg>

          {rows.map((row) => (
            <div
              key={row.task.id}
              className="absolute right-0 left-0"
              style={{ top: row.index * rowHeight, height: rowHeight }}
            >
              <Link
                href={`/${orgSlug}/tasks/${row.task.id}`}
                // The bar is a picture; the label carries the same facts.
                aria-label={`${row.task.title}, ${row.task.startDate ?? 'no start date'} to ${row.task.dueDate ?? 'no due date'}`}
                className={cn(
                  'focus-visible:outline-ring absolute flex h-6 items-center gap-2 rounded-sm px-2 focus-visible:outline-2',
                  row.task.completedAt
                    ? 'bg-success-soft text-success'
                    : isOverdue(row.task)
                      ? 'bg-danger-soft text-danger'
                      : 'bg-accent-soft text-accent',
                )}
                style={{ left: `${row.left}%`, width: `${row.width}%`, minWidth: '2rem' }}
              >
                <span className="truncate text-[11px] font-medium">{row.task.title}</span>
              </Link>
            </div>
          ))}
        </div>

        <ul className="border-border mt-4 space-y-1 border-t pt-3">
          {rows.map((row) => (
            <li key={row.task.id} className="flex items-center gap-3 text-[12px]">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  row.task.completedAt
                    ? 'bg-success'
                    : isOverdue(row.task)
                      ? 'bg-danger'
                      : 'bg-accent',
                )}
              />
              <Link href={`/${orgSlug}/tasks/${row.task.id}`} className="text-fg hover:underline">
                {row.task.title}
              </Link>
              <span className="text-fg-muted ml-auto font-mono">
                {row.task.startDate ?? '—'} → {row.task.dueDate ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export { PRIORITY_TONE };
