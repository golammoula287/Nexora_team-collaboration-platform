'use client';

import {
  Badge,
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
  cn,
} from '@nexora/ui';
import { Checkbox } from '@nexora/ui';
import type { ViewConfig } from '@nexora/shared';
import { Bookmark, Link2, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../../../../lib/api';

/**
 * Saved views: the strip of named views above the board, and the dialog that
 * saves the current one.
 *
 * The "Copy link" action copies a URL carrying the view's share token. That
 * link is a shortcut, not a grant: opening it still requires signing in and
 * belonging to this workspace, and the API enforces that. Saying so in the
 * dialog matters, because a link that looked like a public share and was not
 * would be worse than no share at all.
 */

export interface SavedView {
  id: string;
  name: string;
  layout: string;
  config: unknown;
  isShared: boolean;
  isDefault: boolean;
  shareToken: string | null;
  ownerId: string | null;
  /** Display only, and absent from the share-token response. */
  ownerName?: string | null | undefined;
}

export function SavedViews({
  orgSlug,
  projectId,
  views,
  activeViewId,
  currentUserId,
  currentConfig,
  currentLayout,
  onApply,
}: {
  orgSlug: string;
  projectId: string;
  views: SavedView[];
  activeViewId: string | null;
  currentUserId: string;
  currentConfig: ViewConfig;
  currentLayout: string;
  onApply: (view: SavedView | null) => void;
}) {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);

    const response = await api.orgs[':orgSlug'].views.$post({
      param: { orgSlug },
      json: {
        projectId,
        name: name.trim(),
        layout: currentLayout as 'board',
        config: currentConfig,
        isShared: shared,
        isDefault,
      },
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Could not save that view.');
      return;
    }

    setSaveOpen(false);
    setName('');
    setShared(false);
    setIsDefault(false);
    toast.success('View saved');
    router.refresh();
  }

  async function remove(view: SavedView) {
    const response = await api.orgs[':orgSlug'].views[':viewId'].$delete({
      param: { orgSlug, viewId: view.id },
    });

    if (!response.ok) {
      toast.error('Could not remove that view.');
      return;
    }

    if (activeViewId === view.id) onApply(null);
    toast.success('View removed');
    router.refresh();
  }

  async function toggleDefault(view: SavedView) {
    const response = await api.orgs[':orgSlug'].views[':viewId'].$patch({
      param: { orgSlug, viewId: view.id },
      json: { isDefault: !view.isDefault },
    });

    if (!response.ok) {
      toast.error('Could not change that.');
      return;
    }

    toast.success(view.isDefault ? 'No longer your default' : 'Set as your default');
    router.refresh();
  }

  async function toggleShared(view: SavedView) {
    const response = await api.orgs[':orgSlug'].views[':viewId'].$patch({
      param: { orgSlug, viewId: view.id },
      json: { isShared: !view.isShared },
    });

    if (!response.ok) {
      toast.error('Could not change that.');
      return;
    }

    // Un-sharing revokes the token, so any link already sent stops working.
    toast.success(view.isShared ? 'Sharing off — the old link no longer works' : 'View shared');
    router.refresh();
  }

  async function copyLink(view: SavedView) {
    if (!view.shareToken) return;

    const url = `${window.location.origin}/${orgSlug}/projects/${projectId}?view=${view.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied — anyone opening it still needs access to this workspace');
    } catch {
      // Clipboard access can be refused; showing the URL is better than failing.
      toast.message(url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Saved views" className="flex flex-wrap items-center gap-1">
        <button
          role="tab"
          type="button"
          aria-selected={activeViewId === null}
          onClick={() => onApply(null)}
          className={cn(
            'focus-visible:outline-ring rounded-sm px-2 py-1 text-[13px] focus-visible:outline-2',
            activeViewId === null
              ? 'bg-surface-2 text-fg font-medium'
              : 'text-fg-muted hover:bg-surface-2',
          )}
        >
          Everything
        </button>

        {views.map((view) => (
          <span key={view.id} className="flex items-center">
            <button
              role="tab"
              type="button"
              aria-selected={activeViewId === view.id}
              onClick={() => onApply(view)}
              className={cn(
                'focus-visible:outline-ring inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[13px] focus-visible:outline-2',
                activeViewId === view.id
                  ? 'bg-surface-2 text-fg font-medium'
                  : 'text-fg-muted hover:bg-surface-2',
              )}
            >
              {view.isDefault ? (
                <Star className="text-accent size-3 fill-current" aria-hidden="true" />
              ) : null}
              {view.name}
              {view.isShared ? <Badge tone="neutral">shared</Badge> : null}
            </button>

            {view.ownerId === currentUserId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`Options for the view ${view.name}`}
                  >
                    <span aria-hidden="true" className="text-[13px] leading-none">
                      ⋯
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{view.name}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void toggleDefault(view)}>
                    {view.isDefault ? 'Remove as my default' : 'Make it my default'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void toggleShared(view)}>
                    {view.isShared ? 'Stop sharing' : 'Share with the workspace'}
                  </DropdownMenuItem>
                  {view.shareToken ? (
                    <DropdownMenuItem onSelect={() => void copyLink(view)}>
                      <Link2 aria-hidden="true" />
                      Copy link
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void remove(view)}>
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)}>
        <Bookmark aria-hidden="true" />
        Save this view
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required error={error ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Urgent and overdue"
                />
              )}
            </Field>

            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={shared}
                onCheckedChange={(next) => setShared(next === true)}
                aria-label="Share with the workspace"
              />
              Share with the workspace
            </label>

            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={isDefault}
                onCheckedChange={(next) => setIsDefault(next === true)}
                aria-label="Open this project on this view"
              />
              Open this project on this view
            </label>

            <p className="text-fg-muted text-[12px]">
              A shared view gets a link. The link is a shortcut, not access: whoever opens it still
              has to sign in and belong to this workspace. &ldquo;Open on this view&rdquo; applies
              to you only.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || !name.trim()} onClick={() => void save()}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
