'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  StatusDot,
  cn,
} from '@nexora/ui';
import { MoveHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  PRIORITY_TONE,
  formatDate,
  isOverdue,
  moveTask,
  type ViewColumn,
  type ViewTask,
} from './shared';

/**
 * The board, with drag AND a keyboard equivalent.
 *
 * Two things make the keyboard path real rather than nominal:
 *
 *   - dnd-kit's KeyboardSensor, so space picks a card up and the arrow keys
 *     move it, which works for anyone using a keyboard by preference
 *   - a "Move to" menu on every card, which works for anyone who cannot hold a
 *     modifier or track a moving target at all
 *
 * docs/UI.md requires a keyboard equivalent for every drag; a sensor alone
 * leaves people who cannot manage a sustained key-hold with nothing.
 */

function SortableCard({
  task,
  orgSlug,
  columns,
  selected,
  onToggle,
  onMoveToColumn,
}: {
  task: ViewTask;
  orgSlug: string;
  columns: ViewColumn[];
  selected: boolean;
  onToggle: () => void;
  onMoveToColumn: (statusId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { statusId: task.statusId },
  });

  const overdue = isOverdue(task);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <Card
        className={cn(
          'transition-colors',
          selected ? 'border-accent ring-accent/30 ring-2' : 'hover:border-border-strong',
        )}
      >
        <CardContent className="space-y-2 p-3 pt-3">
          <div className="flex items-start gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`Select ${task.title}`}
              className="mt-0.5"
            />

            <Link
              href={`/${orgSlug}/tasks/${task.id}`}
              className="focus-visible:outline-ring text-fg flex-1 text-[13px] leading-snug focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {task.title}
            </Link>

            {/* The drag handle carries the sensors, so the card body stays a
                normal link rather than swallowing every click. */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${task.title}. Press space, then use the arrow keys.`}
              className="text-fg-subtle hover:text-fg focus-visible:outline-ring cursor-grab rounded-sm p-0.5 focus-visible:outline-2 active:cursor-grabbing"
            >
              <MoveHorizontal className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-6">
            <span className="text-fg-subtle font-mono text-[11px]">
              {task.projectKey}-{task.number}
            </span>

            {task.priority !== 'none' ? (
              <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>{task.priority}</Badge>
            ) : null}

            {task.dueDate ? (
              <span
                className={`text-[11px] ${overdue ? 'text-danger font-medium' : 'text-fg-muted'}`}
              >
                {overdue ? 'Overdue ' : ''}
                {formatDate(task.dueDate)}
              </span>
            ) : null}

            <span className="ml-auto flex items-center gap-1">
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

              {/* The keyboard equivalent that needs no sustained key-hold. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`Move ${task.title} to another column`}
                  >
                    <span aria-hidden="true" className="text-[14px] leading-none">
                      ⋯
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                  {columns
                    .filter((column) => column.id !== task.statusId)
                    .map((column) => (
                      <DropdownMenuItem key={column.id} onSelect={() => onMoveToColumn(column.id)}>
                        {column.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function BoardView({
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
  const [dragging, setDragging] = useState<ViewTask | null>(null);

  // dnd-kit derives its aria-describedby ids from the DndContext id, which it
  // otherwise generates from a module-level counter - a different number on the
  // server than in the browser, which is a hydration mismatch on every card.
  const dndId = useId();

  // Optimistic copy, so a card follows the cursor without waiting for a round
  // trip. Rolled back by router.refresh() if the server disagrees.
  const [local, setLocal] = useState<ViewTask[] | null>(null);
  const cards = (local ?? tasks).filter((task) => task.parentTaskId === null);

  const sensors = useSensors(
    // A small distance so a click on the handle is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, ViewTask[]>();
    for (const column of columns) {
      map.set(
        column.id,
        cards.filter((task) => task.statusId === column.id),
      );
    }
    return map;
  }, [cards, columns]);

  function onDragStart(event: DragStartEvent) {
    setDragging(cards.find((task) => task.id === event.active.id) ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const moved = cards.find((task) => task.id === active.id);
    if (!moved) return;

    // The drop target is either a card or a column's droppable area.
    const overTask = cards.find((task) => task.id === over.id);
    const targetColumn =
      overTask?.statusId ?? columns.find((column) => column.id === over.id)?.id ?? null;
    if (!targetColumn) return;

    const inTarget = (byColumn.get(targetColumn) ?? []).filter((task) => task.id !== moved.id);
    const index = overTask
      ? inTarget.findIndex((task) => task.id === overTask.id)
      : inTarget.length;

    const before = index >= 0 && index < inTarget.length ? inTarget[index] : null;
    const after = index > 0 ? inTarget[index - 1] : null;

    setLocal(
      cards.map((task) => (task.id === moved.id ? { ...task, statusId: targetColumn } : task)),
    );

    const ok = await moveTask(orgSlug, moved.id, {
      statusId: targetColumn,
      beforeTaskId: before?.id ?? null,
      afterTaskId: after?.id ?? null,
    });

    setLocal(null);
    if (ok) router.refresh();
  }

  async function moveToColumn(task: ViewTask, statusId: string) {
    const column = columns.find((candidate) => candidate.id === statusId);
    const ok = await moveTask(orgSlug, task.id, { statusId });
    if (ok) {
      toast.success(`Moved to ${column?.name ?? 'another column'}`);
      router.refresh();
    }
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${String(active.id)}`,
          onDragOver: () => 'Use the arrow keys to choose a position.',
          onDragEnd: () => 'Dropped. The board has been updated.',
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => {
          const inColumn = byColumn.get(column.id) ?? [];

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

              <SortableContext
                items={inColumn.map((task) => task.id)}
                strategy={verticalListSortingStrategy}
              >
                {inColumn.length === 0 ? (
                  <p className="text-fg-subtle px-1 pb-2 text-[12px]">Nothing here</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {inColumn.map((task) => (
                      <SortableCard
                        key={task.id}
                        task={task}
                        orgSlug={orgSlug}
                        columns={columns}
                        selected={selected.has(task.id)}
                        onToggle={() => onToggle(task.id)}
                        onMoveToColumn={(statusId) => void moveToColumn(task, statusId)}
                      />
                    ))}
                  </ul>
                )}
              </SortableContext>
            </section>
          );
        })}
      </div>

      {/* Only the dragged card gets a shadow, per docs/UI.md. */}
      <DragOverlay>
        {dragging ? (
          <Card className="shadow-drag">
            <CardContent className="p-3 pt-3">
              <p className="text-fg text-[13px]">{dragging.title}</p>
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
