'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Spinner,
  Textarea,
} from '@nexora/ui';
import { TASK_PRIORITIES, createTaskSchema } from '@nexora/shared';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';

const selectClass =
  'border-border bg-surface text-fg focus-visible:outline-ring h-[34px] w-full rounded-sm border px-2 text-[13px] focus-visible:outline-2';

export function NewTaskButton({
  orgSlug,
  projectId,
  statuses,
}: {
  orgSlug: string;
  projectId: string;
  statuses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState(statuses[0]?.id ?? '');
  const [priority, setPriority] = useState<string>('none');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    // The same schema the API validates with.
    const parsed = createTaskSchema.safeParse({
      projectId,
      title,
      description: description || undefined,
      statusId: statusId || undefined,
      priority,
      dueDate: dueDate || undefined,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0] ?? 'form')] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setPending(true);
    const response = await api.orgs[':orgSlug'].tasks.$post({
      param: { orgSlug },
      json: parsed.data,
    });
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setErrors({ form: body.error?.message ?? 'Could not create the task.' });
      return;
    }

    toast.success('Task created');
    setOpen(false);
    setTitle('');
    setDescription('');
    setDueDate('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus aria-hidden="true" />
          New task
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {errors.form ? (
              <p
                role="alert"
                className="border-danger/30 bg-danger-soft text-danger rounded-sm border px-3 py-2 text-[13px]"
              >
                {errors.form}
              </p>
            ) : null}

            <Field label="Title" required error={errors.title}>
              {(props) => (
                <Input
                  {...props}
                  placeholder="Audit the information architecture"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              )}
            </Field>

            <Field label="Description" error={errors.description}>
              {(props) => (
                <Textarea
                  {...props}
                  placeholder="What needs doing, and what done looks like."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Column">
                {(props) => (
                  <select
                    {...props}
                    value={statusId}
                    onChange={(event) => setStatusId(event.target.value)}
                    className={selectClass}
                  >
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Priority">
                {(props) => (
                  <select
                    {...props}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className={selectClass}
                  >
                    {TASK_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Due date" error={errors.dueDate}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                )}
              </Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
              {pending ? <Spinner label="Creating task" /> : null}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
