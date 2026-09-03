'use client';

import { Badge, Button, Card, cn } from '@nexora/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DATE_LOCALE, PRIORITY_TONE, patchTask, today, type ViewTask } from './shared';

/**
 * Month calendar, keyed on the due date.
 *
 * Dragging a task to a different day reschedules it; the keyboard equivalent is
 * the date field on the task itself, and each day cell is a real drop target
 * with an accessible name so it can be reached and understood without a mouse.
 *
 * All arithmetic is in UTC. The `due_date` column is a plain date, so treating
 * it as local time would move tasks across a day boundary for anyone west of
 * Greenwich - a bug that only appears for some users, in some months.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before the first of the month. */
function gridStart(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const weekday = (first.getUTCDay() + 6) % 7; // 0 = Monday
  first.setUTCDate(first.getUTCDate() - weekday);
  return first;
}

export function CalendarView({ orgSlug, tasks }: { orgSlug: string; tasks: ViewTask[] }) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [dragging, setDragging] = useState<string | null>(null);

  // Six weeks of seven days. Grouped into weeks rather than a flat 42, because
  // an ARIA grid needs real rows between the grid and its cells - a flat list of
  // gridcells is an orphaned-role violation, not just untidy markup.
  const weeks = useMemo(() => {
    const start = gridStart(year, month);
    return Array.from({ length: 6 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + week * 7 + day);
        return date;
      }),
    );
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, ViewTask[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const undated = tasks.filter((task) => !task.dueDate && task.parentTaskId === null);

  function shift(delta: number) {
    const date = new Date(Date.UTC(year, month + delta, 1));
    setYear(date.getUTCFullYear());
    setMonth(date.getUTCMonth());
  }

  async function reschedule(taskId: string, dueDate: string) {
    if (await patchTask(orgSlug, taskId, { dueDate })) {
      toast.success('Due date updated');
      router.refresh();
    }
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(DATE_LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <h3 className="text-fg min-w-[10rem] text-center text-[14px] font-medium">{monthLabel}</h3>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setYear(now.getUTCFullYear());
            setMonth(now.getUTCMonth());
          }}
        >
          Today
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div role="grid" aria-label={`${monthLabel}, tasks by due date`}>
          <div role="row" className="border-border bg-surface-2 grid grid-cols-7 border-b">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="text-fg-muted p-2 text-center text-[11px] font-medium tracking-wider uppercase"
              >
                {weekday}
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => (
            <div key={`${year}-${month}-w${weekIndex}`} role="row" className="grid grid-cols-7">
              {week.map((date) => {
                const key = toKey(date);
                const inMonth = date.getUTCMonth() === month;
                const isToday = key === today();
                const dayTasks = byDay.get(key) ?? [];

                return (
                  <div
                    key={key}
                    // A real drop target with a name, so it is reachable and
                    // understandable without a mouse.
                    role="gridcell"
                    aria-label={`${date.toLocaleDateString(DATE_LOCALE, { dateStyle: 'full', timeZone: 'UTC' })}, ${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragging) void reschedule(dragging, key);
                      setDragging(null);
                    }}
                    className={cn(
                      'border-border min-h-24 border-r border-b p-1.5 last:border-r-0',
                      !inMonth && 'bg-surface-2/50',
                      isToday && 'bg-accent-soft',
                    )}
                  >
                    <div
                      className={cn(
                        'mb-1 text-[11px]',
                        isToday ? 'text-accent font-semibold' : 'text-fg-subtle',
                      )}
                    >
                      {date.getUTCDate()}
                    </div>

                    <ul className="space-y-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <li key={task.id}>
                          <Link
                            href={`/${orgSlug}/tasks/${task.id}`}
                            draggable
                            onDragStart={() => setDragging(task.id)}
                            onDragEnd={() => setDragging(null)}
                            className="border-border bg-surface hover:border-border-strong focus-visible:outline-ring block truncate rounded-sm border px-1.5 py-1 text-[11px] focus-visible:outline-2"
                          >
                            {task.title}
                          </Link>
                        </li>
                      ))}
                      {dayTasks.length > 3 ? (
                        <li className="text-fg-subtle px-1 text-[11px]">
                          +{dayTasks.length - 3} more
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {undated.length > 0 ? (
        <section aria-labelledby="undated-heading" className="space-y-2">
          <h3 id="undated-heading" className="text-fg-muted text-[12px] font-medium">
            No due date ({undated.length}) — drag one onto a day to schedule it
          </h3>
          <Card>
            <ul className="flex flex-wrap gap-2 p-3">
              {undated.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/${orgSlug}/tasks/${task.id}`}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className="border-border bg-surface hover:border-border-strong focus-visible:outline-ring inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[12px] focus-visible:outline-2"
                  >
                    {task.title}
                    {task.priority !== 'none' ? (
                      <Badge tone={PRIORITY_TONE[task.priority] ?? 'neutral'}>
                        {task.priority}
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
