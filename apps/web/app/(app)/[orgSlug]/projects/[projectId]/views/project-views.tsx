'use client';

import { Badge, Button, Input, Spinner, cn } from '@nexora/ui';
import {
  LIST_COLUMNS,
  TASK_PRIORITIES,
  countConditions,
  emptyFilter,
  matchesFilter,
  type FilterGroup,
  type ListColumn,
  type ViewConfig,
} from '@nexora/shared';
import {
  CalendarDays,
  Filter,
  GanttChartSquare,
  KanbanSquare,
  List,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../../lib/api';
import { BoardView } from './board-view';
import { CalendarView } from './calendar-view';
import { FilterBuilder } from './filter-builder';
import { ListView } from './list-view';
import { SavedViews, type SavedView } from './saved-views';
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
 * The four views, the filter, the saved views, and the selection that spans
 * them all.
 *
 * Everything a saved view can capture lives in one `ViewConfig` object here:
 * the filter tree, grouping, sort, which list columns are shown and how wide
 * they are. That is deliberate - "save this view" then means serialising one
 * value rather than gathering state from four components that each kept their
 * own, which is how a saved view ends up not restoring what you saved.
 *
 * The quick search box is separate from the filter tree on purpose. Typing
 * three letters to find a card is not the same act as building a filter, and
 * folding it into the tree would make every keystroke edit a saved view.
 */
const DEFAULT_CONFIG: ViewConfig = {
  groupBy: 'none',
  sortKey: 'position',
  sortAscending: true,
};

export function ProjectViews({
  orgSlug,
  projectId,
  columns,
  tasks,
  dependencies,
  savedViews,
  currentUserId,
  initialView,
  canDelete,
}: {
  orgSlug: string;
  projectId: string;
  columns: ViewColumn[];
  tasks: ViewTask[];
  dependencies: DependencyEdge[];
  savedViews: SavedView[];
  currentUserId: string;
  /** From `?view=<token>`, or the caller's default view. */
  initialView: SavedView | null;
  canDelete: boolean;
}) {
  const router = useRouter();

  const [view, setView] = useState<ViewKey>((initialView?.layout as ViewKey) ?? 'board');
  const [activeViewId, setActiveViewId] = useState<string | null>(initialView?.id ?? null);
  const [config, setConfig] = useState<ViewConfig>(
    (initialView?.config as ViewConfig | undefined) ?? DEFAULT_CONFIG,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      for (const assigned of task.assignees) map.set(assigned.userId, assigned.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const filter = config.filter ?? emptyFilter();

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (needle && !task.title.toLowerCase().includes(needle)) return false;
      // The rows are already org- and project-scoped by SQL; this arranges them.
      return matchesFilter({ ...task, labelIds: [] }, config.filter);
    });
  }, [tasks, search, config.filter]);

  const conditionCount = countConditions(config.filter);
  const overdueCount = filtered.filter(isOverdue).length;

  function patchConfig(patch: Partial<ViewConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function applySavedView(saved: SavedView | null) {
    setActiveViewId(saved?.id ?? null);
    setConfig((saved?.config as ViewConfig | undefined) ?? DEFAULT_CONFIG);
    if (saved?.layout) setView(saved.layout as ViewKey);
    setSelected(new Set());
  }

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
    toast.success(`${deleted} task${deleted === 1 ? '' : 's'} moved to Trash`, {
      action: { label: 'Open Trash', onClick: () => router.push(`/${orgSlug}/trash`) },
    });
    setSelected(new Set());
    router.refresh();
  }

  const selectClass =
    'border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2';

  const visibleColumns = config.visibleColumns ?? [...LIST_COLUMNS];

  return (
    <div className="space-y-3">
      <SavedViews
        orgSlug={orgSlug}
        projectId={projectId}
        views={savedViews}
        activeViewId={activeViewId}
        currentUserId={currentUserId}
        currentConfig={config}
        currentLayout={view}
        onApply={applySavedView}
      />

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
          placeholder="Find by title…"
          aria-label="Filter tasks by title"
          className="h-8 w-[12rem]"
        />

        <Button
          variant={conditionCount > 0 ? 'secondary' : 'ghost'}
          size="sm"
          aria-expanded={builderOpen}
          aria-controls="filter-builder"
          onClick={() => setBuilderOpen((open) => !open)}
        >
          <Filter aria-hidden="true" />
          Filter
          {conditionCount > 0 ? <Badge tone="accent">{conditionCount}</Badge> : null}
        </Button>

        {view === 'list' ? (
          <>
            <select
              value={config.groupBy}
              onChange={(event) => patchConfig({ groupBy: event.target.value as 'none' })}
              aria-label="Group by"
              className={selectClass}
            >
              <option value="none">No grouping</option>
              <option value="status">Group by column</option>
              <option value="priority">Group by priority</option>
              <option value="assignee">Group by assignee</option>
            </select>

            <ColumnPicker
              visible={visibleColumns}
              onChange={(next) => patchConfig({ visibleColumns: next })}
            />
          </>
        ) : null}

        {view === 'calendar' ? (
          <select
            value={config.calendarSpan ?? 'month'}
            onChange={(event) => patchConfig({ calendarSpan: event.target.value as 'month' })}
            aria-label="Calendar span"
            className={selectClass}
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        ) : null}

        {conditionCount > 0 || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              patchConfig({ filter: emptyFilter() });
            }}
          >
            <X aria-hidden="true" />
            Clear {conditionCount + (search ? 1 : 0)} filter
            {conditionCount + (search ? 1 : 0) === 1 ? '' : 's'}
          </Button>
        ) : null}

        <span className="ml-auto flex items-center gap-2">
          {overdueCount > 0 ? <Badge tone="danger">{overdueCount} overdue</Badge> : null}
          <Badge tone="neutral">
            {filtered.length} of {tasks.length}
          </Badge>
        </span>
      </div>

      {builderOpen ? (
        <div id="filter-builder">
          <FilterBuilder
            filter={filter}
            context={{ columns, people }}
            onChange={(next: FilterGroup) => patchConfig({ filter: next })}
          />
        </div>
      ) : null}

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
          config={config}
          onConfigChange={patchConfig}
        />
      ) : null}

      {view === 'calendar' ? (
        <CalendarView orgSlug={orgSlug} tasks={filtered} span={config.calendarSpan ?? 'month'} />
      ) : null}

      {view === 'timeline' ? (
        <TimelineView orgSlug={orgSlug} tasks={filtered} dependencies={dependencies} />
      ) : null}
    </div>
  );
}

const COLUMN_LABEL: Record<ListColumn, string> = {
  task: 'Task',
  column: 'Column',
  priority: 'Priority',
  due: 'Due',
  assignees: 'Assignees',
};

/** Which list columns to show - the saved column set, in other words. */
function ColumnPicker({
  visible,
  onChange,
}: {
  visible: ListColumn[];
  onChange: (next: ListColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Columns ({visible.length})
      </Button>

      {open ? (
        <fieldset className="border-border bg-surface shadow-pop absolute z-20 mt-1 space-y-1 rounded-md border p-2">
          <legend className="sr-only">Columns to show</legend>
          {LIST_COLUMNS.map((column) => (
            <label key={column} className="flex items-center gap-2 px-1 text-[13px]">
              <input
                type="checkbox"
                className="accent-accent size-3.5"
                checked={visible.includes(column)}
                // The task column is the row's identity; hiding it would leave
                // a table of attributes belonging to nothing.
                disabled={column === 'task'}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? LIST_COLUMNS.filter((key) => visible.includes(key) || key === column)
                      : visible.filter((key) => key !== column),
                  )
                }
              />
              {COLUMN_LABEL[column]}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
