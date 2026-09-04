'use client';

import { Button, Card, Checkbox, Input, cn } from '@nexora/ui';
import { Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';

/**
 * Checklists on a task.
 *
 * Ticking is optimistic: the box moves the moment it is clicked and the count
 * moves with it, because a checkbox that waits for a round trip feels broken
 * even when it is working. A failure puts it back and says so.
 */

interface ChecklistItem {
  id: string;
  title: string;
  isDone: boolean;
}

interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
  doneCount: number;
  totalCount: number;
}

export function Checklists({
  orgSlug,
  taskId,
  checklists,
  canEdit,
}: {
  orgSlug: string;
  taskId: string;
  checklists: Checklist[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});

  const isDone = (item: ChecklistItem) => local[item.id] ?? item.isDone;

  async function toggleItem(item: ChecklistItem) {
    const next = !isDone(item);
    setLocal((current) => ({ ...current, [item.id]: next }));

    const response = await api.orgs[':orgSlug']['checklist-items'][':itemId'].$patch({
      param: { orgSlug, itemId: item.id },
      json: { isDone: next },
    });

    if (!response.ok) {
      // Put it back rather than leaving the box showing something untrue.
      setLocal((current) => ({ ...current, [item.id]: !next }));
      toast.error('Could not save that.');
      return;
    }
    router.refresh();
  }

  async function addChecklist() {
    const title = newTitle.trim();
    if (!title) return;

    const response = await api.orgs[':orgSlug'].tasks[':taskId'].checklists.$post({
      param: { orgSlug, taskId },
      json: { title },
    });

    if (!response.ok) {
      toast.error('Could not add that checklist.');
      return;
    }

    setNewTitle('');
    setAdding(false);
    toast.success('Checklist added');
    router.refresh();
  }

  async function addItem(checklistId: string) {
    const title = (itemDrafts[checklistId] ?? '').trim();
    if (!title) return;

    const response = await api.orgs[':orgSlug'].checklists[':checklistId'].items.$post({
      param: { orgSlug, checklistId },
      json: { title },
    });

    if (!response.ok) {
      toast.error('Could not add that item.');
      return;
    }

    setItemDrafts((current) => ({ ...current, [checklistId]: '' }));
    router.refresh();
  }

  async function removeItem(itemId: string) {
    const response = await api.orgs[':orgSlug']['checklist-items'][':itemId'].$delete({
      param: { orgSlug, itemId },
    });

    if (!response.ok) {
      toast.error('Could not remove that item.');
      return;
    }
    router.refresh();
  }

  async function removeChecklist(checklistId: string) {
    const response = await api.orgs[':orgSlug'].checklists[':checklistId'].$delete({
      param: { orgSlug, checklistId },
    });

    if (!response.ok) {
      toast.error('Could not remove that checklist.');
      return;
    }
    toast.success('Checklist removed');
    router.refresh();
  }

  return (
    <section aria-labelledby="checklists-heading" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 id="checklists-heading" className="text-fg text-[14px] font-medium">
          Checklists ({checklists.length})
        </h2>
        {canEdit && !adding ? (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            Add checklist
          </Button>
        ) : null}
      </div>

      {adding ? (
        <Card>
          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void addChecklist();
            }}
          >
            <Input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              aria-label="Checklist name"
              placeholder="Definition of done"
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={!newTitle.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancel"
              onClick={() => {
                setAdding(false);
                setNewTitle('');
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </form>
        </Card>
      ) : null}

      {checklists.length === 0 && !adding ? (
        <p className="text-fg-subtle text-[13px]">
          None yet. A checklist is for the steps inside one task.
        </p>
      ) : null}

      {checklists.map((checklist) => {
        const done = checklist.items.filter((item) => isDone(item)).length;
        const total = checklist.items.length;
        const percent = total === 0 ? 0 : Math.round((done / total) * 100);

        return (
          <Card key={checklist.id}>
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <h3 className="text-fg flex-1 text-[13px] font-medium">{checklist.title}</h3>
                <span className="text-fg-muted font-mono text-[12px]">
                  {done}/{total}
                </span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove the checklist ${checklist.title}`}
                    onClick={() => void removeChecklist(checklist.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>

              {/* Progress as a labelled bar, not a bare colour. */}
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${checklist.title}: ${done} of ${total} done`}
                className="bg-surface-2 h-1 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-accent h-full transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <ul className="space-y-1">
                {checklist.items.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2">
                    <Checkbox
                      checked={isDone(item)}
                      disabled={!canEdit}
                      onCheckedChange={() => void toggleItem(item)}
                      aria-label={item.title}
                    />
                    <span
                      className={cn(
                        'flex-1 text-[13px]',
                        isDone(item) ? 'text-fg-subtle line-through' : 'text-fg',
                      )}
                    >
                      {item.title}
                    </span>
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        aria-label={`Remove ${item.title}`}
                        onClick={() => void removeItem(item.id)}
                      >
                        <X className="size-3" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canEdit ? (
                <form
                  className="flex items-center gap-2 pt-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addItem(checklist.id);
                  }}
                >
                  <Input
                    value={itemDrafts[checklist.id] ?? ''}
                    onChange={(event) =>
                      setItemDrafts((current) => ({
                        ...current,
                        [checklist.id]: event.target.value,
                      }))
                    }
                    aria-label={`Add an item to ${checklist.title}`}
                    placeholder="Add an item…"
                    className="h-7 text-[13px]"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={!(itemDrafts[checklist.id] ?? '').trim()}
                  >
                    Add
                  </Button>
                </form>
              ) : null}
            </div>
          </Card>
        );
      })}
    </section>
  );
}
