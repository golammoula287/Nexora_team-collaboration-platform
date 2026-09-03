'use client';

import { Badge, Button, Card, Checkbox, Spinner } from '@nexora/ui';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';

export interface TrashedTask {
  id: string;
  number: number;
  title: string;
  projectKey: string;
  parentTaskId: string | null;
  daysLeft: number;
}

export function TrashList({ orgSlug, tasks }: { orgSlug: string; tasks: TrashedTask[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  // A subtask deleted alongside its parent is restored with it, so offering it
  // separately would be a control that does nothing.
  const restorable = tasks.filter((task) => task.parentTaskId === null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function restore(taskIds: string[]) {
    setPending(true);
    const response = await api.orgs[':orgSlug'].trash.tasks.restore.$post({
      param: { orgSlug },
      json: { taskIds },
    });
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      toast.error(body.error?.message ?? 'Could not restore those tasks.');
      return;
    }

    const { restored } = await response.json();
    toast.success(`${restored} task${restored === 1 ? '' : 's'} restored`);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Trash actions"
          className="border-border bg-surface flex items-center gap-2 rounded-md border p-2"
        >
          <span className="text-fg px-1 text-[13px] font-medium">{selected.size} selected</span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => restore([...selected])}
            disabled={pending}
          >
            {pending ? <Spinner label="Restoring" /> : <RotateCcw aria-hidden="true" />}
            Restore
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}

      <Card>
        <ul className="divide-border divide-y">
          {restorable.map((task) => (
            <li key={task.id} className="flex items-center gap-3 p-3">
              <Checkbox
                checked={selected.has(task.id)}
                onCheckedChange={() => toggle(task.id)}
                aria-label={`Select ${task.title}`}
              />

              <span className="text-fg-subtle font-mono text-[12px]">
                {task.projectKey}-{task.number}
              </span>

              <span className="text-fg min-w-0 flex-1 truncate text-[13px]">{task.title}</span>

              <Badge tone={task.daysLeft <= 7 ? 'warning' : 'neutral'}>
                {task.daysLeft} day{task.daysLeft === 1 ? '' : 's'} left
              </Badge>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => restore([task.id])}
                disabled={pending}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {restorable.length < tasks.length ? (
        <p className="text-fg-subtle text-[12px]">
          {tasks.length - restorable.length} subtask
          {tasks.length - restorable.length === 1 ? '' : 's'} hidden - they are restored with their
          parent.
        </p>
      ) : null}
    </div>
  );
}
