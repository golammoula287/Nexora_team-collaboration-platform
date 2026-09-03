'use client';

import { Avatar, Badge, Card, Checkbox, StatusDot, cn } from '@nexora/ui';
import { TASK_PRIORITIES } from '@nexora/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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

type SortKey = 'position' | 'title' | 'priority' | 'dueDate';
type GroupKey = 'none' | 'status' | 'priority' | 'assignee';

/**
 * The list view: sortable, groupable, with inline edit.
 *
 * A real `<table>` with proper header cells, because a grid of divs is
 * unnavigable with a screen reader - the legacy app shipped malformed table
 * markup and this is the correction. Below `md` it becomes a card list rather
 * than scrolling sideways off the screen (docs/UI.md).
 */
export function ListView({
  orgSlug,
  columns,
  tasks,
  selected,
  onToggle,
}: {
  orgSlug: string;
  columns: ViewColumn[];
  tasks: ViewTask[];
  selected: Set<string>;
  onToggle: (taskId: string) => void;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [ascending, setAscending] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupKey>('none');

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
    if (sortKey === key) setAscending((value) => !value);
    else {
      setSortKey(key);
      setAscending(true);
    }
  }

  function SortHeader({ label, sortBy }: { label: string; sortBy: SortKey }) {
    const active = sortKey === sortBy;
    return (
      <th
        scope="col"
        // Announces the current sort, which an arrow glyph alone does not.
        // aria-sort belongs on the header cell, not on the button inside it.
        aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
        className="px-3 py-2 text-left"
      >
        <button
          type="button"
          onClick={() => toggleSort(sortBy)}
          className="text-fg-muted hover:text-fg focus-visible:outline-ring inline-flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase focus-visible:outline-2"
        >
          {label}
          {active ? (
            ascending ? (
              <ChevronUp className="size-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3" aria-hidden="true" />
            )
          ) : null}
        </button>
      </th>
    );
  }

  // Inline edits confirm out loud. A select that silently snaps back on failure
  // leaves the user believing a change they did not make.
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-fg-muted text-[12px]" htmlFor="group-by">
          Group by
        </label>
        <select
          id="group-by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as GroupKey)}
          className="border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2"
        >
          <option value="none">Nothing</option>
          <option value="status">Column</option>
          <option value="priority">Priority</option>
          <option value="assignee">Assignee</option>
        </select>
      </div>

      {groups.map((group) => (
        <section key={group.label || 'all'} className="space-y-2">
          {group.label ? (
            <h3 className="text-fg-muted px-1 text-[12px] font-medium">
              {group.label} ({group.tasks.length})
            </h3>
          ) : null}

          <Card className="overflow-hidden">
            {/* Below md the table becomes a card list; it never scrolls sideways. */}
            <div className="hidden md:block">
              <table className="w-full border-collapse">
                <thead className="bg-surface-2 border-border border-b">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    <SortHeader label="Task" sortBy="title" />
                    <SortHeader label="Column" sortBy="position" />
                    <SortHeader label="Priority" sortBy="priority" />
                    <SortHeader label="Due" sortBy="dueDate" />
                    <th scope="col" className="px-3 py-2 text-left">
                      <span className="text-fg-muted text-[11px] font-medium tracking-wider uppercase">
                        Assignees
                      </span>
                    </th>
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

                      <td className="px-3 py-2">
                        {/* Inline edit: change the column without leaving the row. */}
                        <select
                          value={task.statusId ?? ''}
                          onChange={(event) => void setStatus(task.id, event.target.value)}
                          aria-label={`Column for ${task.title}`}
                          className="border-border bg-surface text-fg focus-visible:outline-ring h-7 rounded-sm border px-1.5 text-[12px] focus-visible:outline-2"
                        >
                          {columns.map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-2">
                        <select
                          value={task.priority}
                          onChange={(event) => void setPriority(task.id, event.target.value)}
                          aria-label={`Priority for ${task.title}`}
                          className="border-border bg-surface text-fg focus-visible:outline-ring h-7 rounded-sm border px-1.5 text-[12px] focus-visible:outline-2"
                        >
                          {TASK_PRIORITIES.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td
                        className={cn(
                          'px-3 py-2 font-mono text-[12px]',
                          isOverdue(task) ? 'text-danger font-medium' : 'text-fg-muted',
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </td>

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
