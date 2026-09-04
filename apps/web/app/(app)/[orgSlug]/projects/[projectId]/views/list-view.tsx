'use client';

import { Avatar, Badge, Card, Checkbox, StatusDot, cn } from '@nexora/ui';
import { LIST_COLUMNS, TASK_PRIORITIES, type ListColumn, type ViewConfig } from '@nexora/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  PRIORITY_RANK,
  PRIORITY_TONE,
  formatDate,
  isOverdue,
  patchTask,
  type ViewColumn,
  type ViewTask,
} from './shared';

type SortKey = NonNullable<ViewConfig['sortKey']>;

/**
 * The list view: sortable, groupable, resizable, with inline edit.
 *
 * A real `<table>` with proper header cells, because a grid of divs is
 * unnavigable with a screen reader - the legacy app shipped malformed table
 * markup and this is the correction. Below `md` it becomes a card list rather
 * than scrolling sideways off the screen (docs/UI.md).
 *
 * Sort, grouping, which columns are shown and how wide they are all live in the
 * `ViewConfig` the parent owns, so a saved view restores the table exactly as
 * it was left. Column widths are dragged with a real focusable handle that also
 * responds to the arrow keys: a resize you can only do with a mouse is a
 * feature half the users do not have.
 */

const COLUMN_LABEL: Record<ListColumn, string> = {
  task: 'Task',
  column: 'Column',
  priority: 'Priority',
  due: 'Due',
  assignees: 'Assignees',
};

const SORT_BY_COLUMN: Partial<Record<ListColumn, SortKey>> = {
  task: 'title',
  column: 'position',
  priority: 'priority',
  due: 'dueDate',
};

const DEFAULT_WIDTH: Record<ListColumn, number> = {
  task: 320,
  column: 150,
  priority: 130,
  due: 110,
  assignees: 120,
};

const MIN_WIDTH = 80;
const MAX_WIDTH = 800;

export function ListView({
  orgSlug,
  columns,
  tasks,
  selected,
  onToggle,
  config,
  onConfigChange,
}: {
  orgSlug: string;
  columns: ViewColumn[];
  tasks: ViewTask[];
  selected: Set<string>;
  onToggle: (taskId: string) => void;
  config: ViewConfig;
  onConfigChange: (patch: Partial<ViewConfig>) => void;
}) {
  const router = useRouter();
  const dragging = useRef<{ column: ListColumn; startX: number; startWidth: number } | null>(null);

  const [liveWidths, setLiveWidths] = useState<Partial<Record<ListColumn, number>>>({});

  const sortKey = config.sortKey ?? 'position';
  const ascending = config.sortAscending ?? true;
  const groupBy = config.groupBy ?? 'none';
  const visible = config.visibleColumns ?? [...LIST_COLUMNS];

  const widthOf = (column: ListColumn) =>
    liveWidths[column] ?? config.columnWidths?.[column] ?? DEFAULT_WIDTH[column];

  const rows = tasks.filter((task) => task.parentTaskId === null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let result = 0;
      if (sortKey === 'title') result = a.title.localeCompare(b.title);
      else if (sortKey === 'priority')
        result = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      else if (sortKey === 'dueDate')
        // Undated tasks sort last in either direction: "no date" is not early.
        result = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      return ascending ? result : -result;
    });
    return copy;
  }, [rows, sortKey, ascending]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', tasks: sorted }];

    const map = new Map<string, ViewTask[]>();
    for (const task of sorted) {
      const label =
        groupBy === 'status'
          ? (task.statusName ?? 'No column')
          : groupBy === 'priority'
            ? task.priority
            : (task.assignees[0]?.name ?? 'Unassigned');
      map.set(label, [...(map.get(label) ?? []), task]);
    }
    return [...map.entries()].map(([label, groupTasks]) => ({ label, tasks: groupTasks }));
  }, [sorted, groupBy]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) onConfigChange({ sortAscending: !ascending });
    else onConfigChange({ sortKey: key, sortAscending: true });
  }

  function commitWidth(column: ListColumn, width: number) {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
    setLiveWidths((current) => ({ ...current, [column]: clamped }));
    onConfigChange({ columnWidths: { ...(config.columnWidths ?? {}), [column]: clamped } });
  }

  function startResize(column: ListColumn, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragging.current = { column, startX: event.clientX, startWidth: widthOf(column) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizeMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = dragging.current;
    if (!state) return;
    const width = state.startWidth + (event.clientX - state.startX);
    setLiveWidths((current) => ({
      ...current,
      [state.column]: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)),
    }));
  }

  function endResize(event: React.PointerEvent<HTMLButtonElement>) {
    const state = dragging.current;
    dragging.current = null;
    if (!state) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commitWidth(state.column, widthOf(state.column));
  }

  async function setPriority(taskId: string, priority: string) {
    if (await patchTask(orgSlug, taskId, { priority })) {
      toast.success('Priority updated');
      router.refresh();
    }
  }

  async function setStatus(taskId: string, statusId: string) {
    const column = columns.find((candidate) => candidate.id === statusId);
    if (await patchTask(orgSlug, taskId, { statusId })) {
      toast.success(`Moved to ${column?.name ?? 'another column'}`);
      router.refresh();
    }
  }

  function Header({ column }: { column: ListColumn }) {
    const sortBy = SORT_BY_COLUMN[column];
    const active = sortBy !== undefined && sortKey === sortBy;

    return (
      <th
        scope="col"
        // aria-sort belongs on the header cell, not on the button inside it.
        aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
        style={{ width: widthOf(column) }}
        className="relative px-3 py-2 text-left"
      >
        {sortBy ? (
          <button
            type="button"
            onClick={() => toggleSort(sortBy)}
            className="text-fg-muted hover:text-fg focus-visible:outline-ring inline-flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase focus-visible:outline-2"
          >
            {COLUMN_LABEL[column]}
            {active ? (
              ascending ? (
                <ChevronUp className="size-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3" aria-hidden="true" />
              )
            ) : null}
          </button>
        ) : (
          <span className="text-fg-muted text-[11px] font-medium tracking-wider uppercase">
            {COLUMN_LABEL[column]}
          </span>
        )}

        {/*
          A separator you can drag with a pointer and nudge with the arrow keys.
          role="separator" with aria-valuenow is what a screen reader needs to
          say "column width, 320" rather than announcing an unlabelled button.
        */}
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Width of the ${COLUMN_LABEL[column]} column`}
          aria-valuenow={widthOf(column)}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          onPointerDown={(event) => startResize(column, event)}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 40 : 8;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              commitWidth(column, widthOf(column) - step);
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              commitWidth(column, widthOf(column) + step);
            }
          }}
          className="hover:bg-accent focus-visible:bg-accent focus-visible:outline-ring absolute top-0 right-0 h-full w-1 cursor-col-resize focus-visible:outline-2"
        />
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.label || 'all'} className="space-y-2">
          {group.label ? (
            <h3 className="text-fg-muted px-1 text-[12px] font-medium">
              {group.label} ({group.tasks.length})
            </h3>
          ) : null}

          <Card className="overflow-hidden">
            {/* Below md the table becomes a card list; it never scrolls sideways. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead className="bg-surface-2 border-border border-b">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    {LIST_COLUMNS.filter((column) => visible.includes(column)).map((column) => (
                      <Header key={column} column={column} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => (
                    <tr
                      key={task.id}
                      className={cn(
                        'border-border hover:bg-surface-2 border-b last:border-0',
                        selected.has(task.id) && 'bg-accent-soft',
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(task.id)}
                          onCheckedChange={() => onToggle(task.id)}
                          aria-label={`Select ${task.title}`}
                        />
                      </td>

                      {visible.includes('task') ? (
                        <td className="px-3 py-2">
                          <Link
                            href={`/${orgSlug}/tasks/${task.id}`}
                            className="text-fg focus-visible:outline-ring text-[13px] hover:underline focus-visible:outline-2"
                          >
                            <span className="text-fg-subtle mr-2 font-mono text-[11px]">
                              {task.projectKey}-{task.number}
                            </span>
                            {task.title}
                          </Link>
                        </td>
                      ) : null}

                      {visible.includes('column') ? (
                        <td className="px-3 py-2">
                          {/* Inline edit: change the column without leaving the row. */}
                          <select
                            value={task.statusId ?? ''}
                            onChange={(event) => void setStatus(task.id, event.target.value)}
                            aria-label={`Column for ${task.title}`}
                            className="border-border bg-surface text-fg focus-visible:outline-ring h-7 w-full rounded-sm border px-1.5 text-[12px] focus-visible:outline-2"
                          >
                            {columns.map((column) => (
                              <option key={column.id} value={column.id}>
                                {column.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}

                      {visible.includes('priority') ? (
                        <td className="px-3 py-2">
                          <select
                            value={task.priority}
                            onChange={(event) => void setPriority(task.id, event.target.value)}
                            aria-label={`Priority for ${task.title}`}
                            className="border-border bg-surface text-fg focus-visible:outline-ring h-7 w-full rounded-sm border px-1.5 text-[12px] focus-visible:outline-2"
                          >
                            {TASK_PRIORITIES.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}

                      {visible.includes('due') ? (
                        <td
                          className={cn(
                            'px-3 py-2 font-mono text-[12px]',
                            isOverdue(task) ? 'text-danger font-medium' : 'text-fg-muted',
                          )}
                        >
                          {formatDate(task.dueDate)}
                        </td>
                      ) : null}

                      {visible.includes('assignees') ? (
                        <td className="px-3 py-2">
                          <span className="flex -space-x-1">
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
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-border divide-y md:hidden">
              {group.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={selected.has(task.id)}
                    onCheckedChange={() => onToggle(task.id)}
                    aria-label={`Select ${task.title}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      href={`/${orgSlug}/tasks/${task.id}`}
                      className="text-fg block text-[13px] hover:underline"
                    >
                      {task.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusDot
                        tone={task.statusCategory === 'done' ? 'success' : 'neutral'}
                        label={task.statusName ?? 'No column'}
                      />
                      {task.priority !== 'none' ? (
                        <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>
                          {task.priority}
                        </Badge>
                      ) : null}
                      <span
                        className={cn(
                          'text-[11px]',
                          isOverdue(task) ? 'text-danger font-medium' : 'text-fg-muted',
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
