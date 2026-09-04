'use client';

import {
  Avatar,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
} from '@nexora/ui';
import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';

/**
 * The things you can do *to* a task rather than *in* it: watch it, save it as a
 * template, promote it to a project.
 *
 * Watching is a toggle, so it gets its own button - burying a binary state in a
 * menu makes it invisible, and the point of watching is that you can tell at a
 * glance whether you are.
 */

interface Watcher {
  userId: string;
  name: string;
  image: string | null;
}

interface Space {
  id: string;
  name: string;
}

export function TaskActions({
  orgSlug,
  taskId,
  taskTitle,
  watchers,
  currentUserId,
  spaces,
  canCreateProject,
}: {
  orgSlug: string;
  taskId: string;
  taskTitle: string;
  watchers: Watcher[];
  currentUserId: string;
  spaces: Space[];
  canCreateProject: boolean;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(watchers.some((w) => w.userId === currentUserId));
  const [pending, setPending] = useState(false);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(taskTitle);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [projectKey, setProjectKey] = useState('');
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function toggleWatch() {
    const next = !watching;
    setWatching(next);
    setPending(true);

    const response = next
      ? await api.orgs[':orgSlug'].tasks[':taskId'].watchers.$post({
          param: { orgSlug, taskId },
          json: {},
        })
      : await api.orgs[':orgSlug'].tasks[':taskId'].watchers.remove.$post({
          param: { orgSlug, taskId },
          json: {},
        });

    setPending(false);

    if (!response.ok) {
      setWatching(!next);
      toast.error('Could not change that.');
      return;
    }

    toast.success(next ? 'Watching this task' : 'No longer watching');
    router.refresh();
  }

  async function saveAsTemplate() {
    setPending(true);
    setError(null);

    const response = await api.orgs[':orgSlug'].templates.task.$post({
      param: { orgSlug },
      json: { taskId, name: templateName.trim() },
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Could not save that template.');
      return;
    }

    setTemplateOpen(false);
    toast.success('Saved as a template');
    router.refresh();
  }

  async function promote() {
    setPending(true);
    setError(null);

    const response = await api.orgs[':orgSlug'].tasks[':taskId']['to-project'].$post({
      param: { orgSlug, taskId },
      json: { spaceId, key: projectKey.trim().toUpperCase(), moveSubtasks: true },
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Could not promote that task.');
      return;
    }

    const { id } = (await response.json()) as { id: string };
    setPromoteOpen(false);
    toast.success('Promoted to a project');
    router.push(`/${orgSlug}/projects/${id}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={watching ? 'secondary' : 'ghost'}
        size="sm"
        disabled={pending}
        onClick={() => void toggleWatch()}
        aria-pressed={watching}
      >
        {watching ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
        {watching ? 'Watching' : 'Watch'}
        {watchers.length > 0 ? (
          <span className="text-fg-subtle ml-1 font-mono text-[11px]">{watchers.length}</span>
        ) : null}
      </Button>

      {watchers.length > 0 ? (
        <span className="flex -space-x-1" aria-hidden="true">
          {watchers.slice(0, 3).map((watcher) => (
            <Avatar
              key={watcher.userId}
              name={watcher.name}
              src={watcher.image}
              size="sm"
              className="ring-surface ring-2"
            />
          ))}
        </span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions for this task">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Reuse</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
            Save as a template
          </DropdownMenuItem>
          {canCreateProject && spaces.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPromoteOpen(true)}>
                Promote to a project
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as a template</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Template name" required error={error ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              )}
            </Field>
            <p className="text-fg-muted text-[12px]">
              Its subtasks and checklists are copied in. The template is a snapshot: editing this
              task later will not change it.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || !templateName.trim()} onClick={() => void saveAsTemplate()}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to a project</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Space" required>
              {(props) => (
                <select
                  {...props}
                  value={spaceId}
                  onChange={(event) => setSpaceId(event.target.value)}
                  className="border-border bg-surface text-fg focus-visible:outline-ring h-9 w-full rounded-sm border px-2 text-[13px] focus-visible:outline-2"
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field
              label="Project key"
              required
              hint="Prefixes every task in the new project."
              error={error ?? undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  value={projectKey}
                  onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
                  placeholder="WEB"
                  className="font-mono"
                />
              )}
            </Field>

            <p className="text-fg-muted text-[12px]">
              Subtasks move up to become the new project&rsquo;s tasks. This task stays where it is,
              with a note saying where the work went.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || projectKey.trim().length < 2} onClick={() => void promote()}>
              Promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
