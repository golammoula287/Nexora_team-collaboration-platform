'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Spinner,
  Textarea,
} from '@nexora/ui';
import { PROJECT_STATUSES, createProjectSchema } from '@nexora/shared';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../lib/api';

export interface SpaceOption {
  id: string;
  name: string;
}

/** Derive a plausible key from the name, as a starting point the user can edit. */
function suggestKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const candidate =
    words.length === 1
      ? (words[0] as string).slice(0, 4)
      : words.map((word) => word[0] ?? '').join('');
  return candidate
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

export function NewProjectButton({ orgSlug, spaces }: { orgSlug: string; spaces: SpaceOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const effectiveKey = keyTouched ? key : suggestKey(name);

  function reset() {
    setName('');
    setKey('');
    setKeyTouched(false);
    setDescription('');
    setDueDate('');
    setErrors({});
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    // The same schema the API validates with, so the messages match.
    const parsed = createProjectSchema.safeParse({
      spaceId,
      name,
      key: effectiveKey,
      description: description || undefined,
      dueDate: dueDate || undefined,
      status: 'planning',
      visibility: 'org',
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setPending(true);

    const response = await api.orgs[':orgSlug'].projects.$post({
      param: { orgSlug },
      json: parsed.data,
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setErrors({ form: body.error?.message ?? 'Could not create the project.' });
      return;
    }

    const { id } = await response.json();
    toast.success(`${parsed.data.name} created`);
    setOpen(false);
    reset();
    router.push(`/${orgSlug}/projects/${id}`);
    router.refresh();
  }

  if (spaces.length === 0) {
    return (
      <Button variant="secondary" disabled title="Create a space first">
        New project
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>

      <DialogContent aria-describedby="new-project-description">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription id="new-project-description">
              It starts with a board of four columns. You can change them later.
            </DialogDescription>
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

            <Field label="Name" required error={errors.name}>
              {(props) => (
                <Input
                  {...props}
                  placeholder="Northwind Rebrand"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Key"
                required
                hint="Prefixes every task, as in NWR-123."
                error={errors.key}
              >
                {(props) => (
                  <Input
                    {...props}
                    className="font-mono uppercase"
                    placeholder="NWR"
                    value={effectiveKey}
                    onChange={(event) => {
                      setKeyTouched(true);
                      setKey(event.target.value.toUpperCase());
                    }}
                  />
                )}
              </Field>

              <Field label="Space" required error={errors.spaceId}>
                {(props) => (
                  <select
                    {...props}
                    value={spaceId}
                    onChange={(event) => setSpaceId(event.target.value)}
                    className="border-border bg-surface text-fg focus-visible:outline-ring h-[34px] w-full rounded-sm border px-2 text-[13px] focus-visible:outline-2"
                  >
                    {spaces.map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label="Description" error={errors.description}>
              {(props) => (
                <Textarea
                  {...props}
                  placeholder="What this project is for."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
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
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
              {pending ? <Spinner label="Creating project" /> : null}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { PROJECT_STATUSES };
