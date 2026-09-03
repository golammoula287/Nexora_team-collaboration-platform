'use client';

import { Badge, Button, Input, Spinner, cn } from '@nexora/ui';
import { TASK_PRIORITIES } from '@nexora/shared';
import { CalendarDays, GanttChartSquare, KanbanSquare, List, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../../lib/api';
import { BoardView } from './board-view';
import { CalendarView } from './calendar-view';
import { ListView } from './list-view';
import { TimelineView, type DependencyEdge } from './timeline-view';
import { isOverdue, type ViewColumn, type ViewTask } from './shared';

type ViewKey = 'board' | 'list' | 'calendar' | 'timeline';

const VIEWS: { key: ViewKey; label: string; icon: typeof List }[] = [
  { key: 'board', label: 'Board', icon: KanbanSquare },
  { key: 'list', label: 'List', icon: List },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
];

/**
 * The four views, the filter bar, and the selection that spans them.
 *
 * Selection and filters live at this level so switching view keeps both - a
 * user who has selected six tasks on the board and switches to the list has
 * not changed their mind about the six tasks.
 */
export function ProjectViews({
  orgSlug,
  columns,
  tasks,
  dependencies,
  canDelete,
}: {
  orgSlug: string;
  columns: ViewColumn[];
  tasks: ViewTask[];
  dependencies: DependencyEdge[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>('board');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      for (const assigned of task.assignees) map.set(assigned.userId, assigned.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (needle && !task.title.toLowerCase().includes(needle)) return false;
      if (priority && task.priority !== priority) return false;
      if (assignee && !task.assignees.some((person) => person.userId === assignee)) return false;
      if (onlyOverdue && !isOverdue(task)) return false;
      return true;
    });
  }, [tasks, search, priority, assignee, onlyOverdue]);

  const activeFilters = [search, priority, assignee, onlyOverdue ? 'overdue' : ''].filter(
    Boolean,
  ).length;

  function toggle(taskId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function clearFilters() {
    setSearch('');
    setPriority('');
    setAssignee('');
    setOnlyOverdue(false);
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
    toast.success(`${deleted} task${deleted === 1 ? '' : 's'} moved to Trash`, {
      action: { label: 'Open Trash', onClick: () => router.push(`/${orgSlug}/trash`) },
    });
    setSelected(new Set());
    router.refresh();
  }

  const selectClass =
    'border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2';

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="View"
        className="border-border flex w-fit gap-0.5 rounded-md border p-0.5"
      >
        {VIEWS.map((option) => (
          <button
            key={option.key}
            role="tab"
            type="button"
            aria-selected={view === option.key}
            onClick={() => setView(option.key)}
            className={cn(
              'focus-visible:outline-ring inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[13px] transition-colors focus-visible:outline-2',
              view === option.key
                ? 'bg-accent-soft text-accent font-medium'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <option.icon className="size-3.5" aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by title…"
          aria-label="Filter tasks by title"
          className="h-8 w-[12rem]"
        />

        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          aria-label="Filter by priority"
          className={selectClass}
        >
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          aria-label="Filter by assignee"
          className={selectClass}
        >
          <option value="">Anyone</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>

        <label className="text-fg-muted inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(event) => setOnlyOverdue(event.target.checked)}
            className="accent-accent size-3.5"
          />
          Overdue only
        </label>

        {activeFilters > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </Button>
        ) : null}

        <Badge tone="neutral" className="ml-auto">
          {filtered.length} of {tasks.length}
        </Badge>
      </div>

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
            className={selectClass}
          >
            <option value="" disabled>
              Set priority…
            </option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
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
            className={selectClass}
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

      {view === 'board' ? (
        <BoardView
          orgSlug={orgSlug}
          columns={columns}
          tasks={filtered}
          selected={selected}
          onToggle={toggle}
        />
      ) : null}

      {view === 'list' ? (
        <ListView
          orgSlug={orgSlug}
          columns={columns}
          tasks={filtered}
          selected={selected}
          onToggle={toggle}
        />
      ) : null}

      {view === 'calendar' ? <CalendarView orgSlug={orgSlug} tasks={filtered} /> : null}

      {view === 'timeline' ? (
        <TimelineView orgSlug={orgSlug} tasks={filtered} dependencies={dependencies} />
      ) : null}
    </div>
  );
}
