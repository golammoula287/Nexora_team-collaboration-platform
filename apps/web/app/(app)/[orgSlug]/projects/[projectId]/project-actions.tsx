'use client';

import {
  Button,
  Checkbox,
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
  DropdownMenuTrigger,
  Field,
  Input,
} from '@nexora/ui';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../lib/api';

/**
 * Duplicating a project, and saving one as a template.
 *
 * Both ask the same question - copy the tasks too, or just the board? - and
 * both refuse to guess. Copying a hundred tasks nobody wanted is tedious to
 * undo; copying none when they were wanted is one more click.
 */
export function ProjectActions({
  orgSlug,
  projectId,
  projectName,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [name, setName] = useState(`${projectName} (copy)`);
  const [key, setKey] = useState('');
  const [copyTasks, setCopyTasks] = useState(false);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(projectName);
  const [templateTasks, setTemplateTasks] = useState(false);

  async function duplicate() {
    setPending(true);
    setError(null);

    const response = await api.orgs[':orgSlug'].projects[':projectId'].duplicate.$post({
      param: { orgSlug, projectId },
      json: { name: name.trim(), key: key.trim().toUpperCase(), includeTasks: copyTasks },
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Could not duplicate that project.');
      return;
    }

    const { id } = (await response.json()) as { id: string };
    setDuplicateOpen(false);
    toast.success('Project duplicated');
    router.push(`/${orgSlug}/projects/${id}`);
  }

  async function saveTemplate() {
    setPending(true);
    setError(null);

    const response = await api.orgs[':orgSlug'].templates.project.$post({
      param: { orgSlug },
      json: { projectId, name: templateName.trim(), includeTasks: templateTasks },
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions for this project">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Reuse</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
            Duplicate this project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
            Save as a template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate {projectName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              {(props) => (
                <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />
              )}
            </Field>

            <Field
              label="Key"
              required
              hint="Prefixes every task. It has to be unused."
              error={error ?? undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  value={key}
                  onChange={(event) => setKey(event.target.value.toUpperCase())}
                  placeholder="NWR"
                  className="font-mono"
                />
              )}
            </Field>

            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={copyTasks}
                onCheckedChange={(next) => setCopyTasks(next === true)}
                aria-label="Copy the tasks as well"
              />
              Copy the tasks as well
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !name.trim() || key.trim().length < 2}
              onClick={() => void duplicate()}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={templateTasks}
                onCheckedChange={(next) => setTemplateTasks(next === true)}
                aria-label="Include the tasks"
              />
              Include the tasks
            </label>

            <p className="text-fg-muted text-[12px]">
              A snapshot, not a link: changing this project later will not change the template.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || !templateName.trim()} onClick={() => void saveTemplate()}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
