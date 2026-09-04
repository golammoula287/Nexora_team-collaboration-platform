'use client';

import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  StatusDot,
} from '@nexora/ui';
import { STATUS_CATEGORIES } from '@nexora/shared';
import { ChevronDown, ChevronUp, Plus, Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';

/**
 * Editing the board's columns.
 *
 * Two details carry the weight here.
 *
 * **Category is not the name.** A team can call their done column "Shipped";
 * what makes a card complete is the column's *category*, and the form says so
 * rather than leaving people to discover it.
 *
 * **Deleting asks where the cards go.** The API refuses a delete that would
 * strand tasks, so the dialog collects the answer instead of showing an error
 * after the fact.
 */

interface Column {
  id: string;
  name: string;
  category: string;
  color: string | null;
  wipLimit: number | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  todo: 'Not started',
  'in-progress': 'In progress',
  done: 'Complete',
  cancelled: 'Cancelled',
};

export function ColumnsEditor({
  orgSlug,
  projectId,
  columns,
  counts,
}: {
  orgSlug: string;
  projectId: string;
  columns: Column[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('todo');

  const [deleting, setDeleting] = useState<Column | null>(null);
  const [moveTo, setMoveTo] = useState('');

  async function call(action: () => Promise<Response>, success: string) {
    setPending(true);
    setError(null);
    const response = await action();
    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'That did not work.');
      return false;
    }

    toast.success(success);
    router.refresh();
    return true;
  }

  async function rename(column: Column, name: string) {
    if (name.trim() === column.name || !name.trim()) return;
    await call(
      () =>
        api.orgs[':orgSlug'].columns[':columnId'].$patch({
          param: { orgSlug, columnId: column.id },
          json: { name: name.trim() },
        }),
      'Column renamed',
    );
  }

  async function setCategory(column: Column, category: string) {
    await call(
      () =>
        api.orgs[':orgSlug'].columns[':columnId'].$patch({
          param: { orgSlug, columnId: column.id },
          json: { category: category as 'todo' },
        }),
      'Column updated',
    );
  }

  async function setWip(column: Column, value: string) {
    const wipLimit = value === '' ? null : Number.parseInt(value, 10);
    if (wipLimit !== null && (Number.isNaN(wipLimit) || wipLimit < 1)) return;

    await call(
      () =>
        api.orgs[':orgSlug'].columns[':columnId'].$patch({
          param: { orgSlug, columnId: column.id },
          json: { wipLimit },
        }),
      'Limit updated',
    );
  }

  async function move(index: number, direction: -1 | 1) {
    const column = columns[index];
    const target = columns[index + direction];
    if (!column || !target) return;

    // Neighbours, not indexes: the server derives the ordering key.
    await call(
      () =>
        api.orgs[':orgSlug'].columns[':columnId'].move.$post({
          param: { orgSlug, columnId: column.id },
          json:
            direction === -1
              ? { beforeColumnId: target.id, afterColumnId: columns[index - 2]?.id ?? null }
              : { afterColumnId: target.id, beforeColumnId: columns[index + 2]?.id ?? null },
        }),
      'Column moved',
    );
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;

    const ok = await call(
      () =>
        api.orgs[':orgSlug'].projects[':projectId'].columns.$post({
          param: { orgSlug, projectId },
          json: { name, category: newCategory as 'todo' },
        }),
      'Column added',
    );

    if (ok) {
      setNewName('');
      setNewCategory('todo');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;

    const ok = await call(
      () =>
        api.orgs[':orgSlug'].columns[':columnId'].delete.$post({
          param: { orgSlug, columnId: deleting.id },
          json: moveTo ? { moveTasksToColumnId: moveTo } : {},
        }),
      'Column removed',
    );

    if (ok) {
      setDeleting(null);
      setMoveTo('');
    }
  }

  const selectClass =
    'border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2';

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden="true" />
        Columns
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Board columns</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            {error ? (
              <p role="alert" className="text-danger text-[13px]">
                {error}
              </p>
            ) : null}

            <ul className="space-y-2">
              {columns.map((column, index) => (
                <li key={column.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2 p-2">
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={index === 0 || pending}
                          aria-label={`Move ${column.name} earlier`}
                          onClick={() => void move(index, -1)}
                        >
                          <ChevronUp className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={index === columns.length - 1 || pending}
                          aria-label={`Move ${column.name} later`}
                          onClick={() => void move(index, 1)}
                        >
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>

                      <Input
                        defaultValue={column.name}
                        aria-label={`Name of the ${column.name} column`}
                        className="h-8 w-40"
                        onBlur={(event) => void rename(column, event.target.value)}
                      />

                      <select
                        value={column.category}
                        aria-label={`Behaviour of the ${column.name} column`}
                        className={selectClass}
                        onChange={(event) => void setCategory(column, event.target.value)}
                      >
                        {STATUS_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {CATEGORY_LABEL[category] ?? category}
                          </option>
                        ))}
                      </select>

                      <Input
                        type="number"
                        min={1}
                        defaultValue={column.wipLimit ?? ''}
                        placeholder="WIP"
                        aria-label={`Work-in-progress limit for ${column.name}`}
                        className="h-8 w-20"
                        onBlur={(event) => void setWip(column, event.target.value)}
                      />

                      <span className="text-fg-muted ml-auto font-mono text-[12px]">
                        {counts[column.id] ?? 0}
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={columns.length === 1 || pending}
                        aria-label={`Remove the ${column.name} column`}
                        onClick={() => {
                          setDeleting(column);
                          setMoveTo(columns.find((other) => other.id !== column.id)?.id ?? '');
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            <Card>
              <form
                className="flex flex-wrap items-end gap-2 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void add();
                }}
              >
                <Field label="New column" className="flex-1">
                  {(props) => (
                    <Input
                      {...props}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Blocked"
                      className="h-8"
                    />
                  )}
                </Field>

                <Field label="Behaviour">
                  {(props) => (
                    <select
                      {...props}
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      className={selectClass}
                    >
                      {STATUS_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_LABEL[category] ?? category}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Button type="submit" size="sm" disabled={pending || !newName.trim()}>
                  <Plus aria-hidden="true" />
                  Add
                </Button>
              </form>
            </Card>

            <p className="text-fg-muted text-[12px]">
              A card is complete when it sits in a column whose behaviour is
              &ldquo;Complete&rdquo; &mdash; the name is yours to choose.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleting?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {(counts[deleting?.id ?? ''] ?? 0) > 0 ? (
              <>
                <p className="text-fg text-[13px]">
                  That column holds {counts[deleting?.id ?? ''] ?? 0} task
                  {(counts[deleting?.id ?? ''] ?? 0) === 1 ? '' : 's'}. Where should they go?
                </p>
                <Field label="Move them to" required>
                  {(props) => (
                    <select
                      {...props}
                      value={moveTo}
                      onChange={(event) => setMoveTo(event.target.value)}
                      className="border-border bg-surface text-fg focus-visible:outline-ring h-9 w-full rounded-sm border px-2 text-[13px] focus-visible:outline-2"
                    >
                      {columns
                        .filter((column) => column.id !== deleting?.id)
                        .map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name}
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
              </>
            ) : (
              <p className="text-fg text-[13px]">
                That column is empty. Removing it changes nothing else.
              </p>
            )}

            <StatusDot tone="neutral" label="Columns are configuration - this is not undoable." />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => void confirmDelete()}>
              Remove column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
