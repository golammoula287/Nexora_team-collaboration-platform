'use client';

import {
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  Kbd,
} from '@nexora/ui';
import { FileText, FolderKanban, Inbox, Moon, Plus, Settings, Sun, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { authClient } from '../../lib/auth-client';
import { modKeyLabel, useKeyboardShortcut } from '../../hooks/use-keyboard-shortcut';
import { Sidebar, SidebarContent, type OrgSummary } from './sidebar';
import { Topbar, type CurrentUser } from './topbar';

/**
 * The application frame: sidebar, topbar, command palette, shortcuts.
 *
 * Everything inside is a Server Component by default; this shell is a client
 * component because the palette and menus are interactive. It is the boundary,
 * not the whole page.
 */
export function AppShell({
  orgSlug,
  organizations,
  user,
  breadcrumbs,
  children,
}: {
  orgSlug: string;
  organizations: OrgSummary[];
  user: CurrentUser;
  breadcrumbs: { label: string; href?: string }[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const current =
    organizations.find((org) => org.slug === orgSlug) ?? (organizations[0] as OrgSummary);

  const go = (path: string) => {
    setPaletteOpen(false);
    router.push(path);
  };

  const shortcuts = useMemo(
    () => [
      { key: 'k', mod: true, handler: () => setPaletteOpen((open) => !open) },
      // "/" focuses search, the convention everywhere from GitHub to Slack.
      { key: '/', handler: () => setPaletteOpen(true) },
    ],
    [],
  );
  useKeyboardShortcut(shortcuts);

  async function signOut() {
    await authClient.signOut();
    router.push('/sign-in');
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar
        orgSlug={orgSlug}
        organizations={organizations}
        current={current}
        user={user}
        breadcrumbs={breadcrumbs}
        onOpenSearch={() => setPaletteOpen(true)}
        onSignOut={signOut}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar>
          <SidebarContent orgSlug={orgSlug} organizations={organizations} current={current} />
        </Sidebar>

        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search or jump to…" />
        <CommandList>
          <CommandEmpty>
            No results. Semantic search across your workspace arrives in phase 6.
          </CommandEmpty>

          <CommandGroup heading="Go to">
            <CommandItem icon={<Inbox />} onSelect={() => go(`/${orgSlug}/inbox`)}>
              Inbox
            </CommandItem>
            <CommandItem icon={<FolderKanban />} onSelect={() => go(`/${orgSlug}/projects`)}>
              Projects
            </CommandItem>
            <CommandItem icon={<FileText />} onSelect={() => go(`/${orgSlug}/docs`)}>
              Docs
            </CommandItem>
            <CommandItem icon={<Users />} onSelect={() => go(`/${orgSlug}/admin`)}>
              Members
            </CommandItem>
            <CommandItem icon={<Settings />} onSelect={() => go(`/${orgSlug}/settings`)}>
              Settings
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Actions">
            <CommandItem
              icon={<Plus />}
              onSelect={() => go(`/${orgSlug}/projects`)}
              value="new project create"
            >
              New project
            </CommandItem>
            <CommandItem
              icon={resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              onSelect={() => {
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                setPaletteOpen(false);
              }}
              value="toggle theme dark light appearance"
            >
              Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <CommandFooter>
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> select
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>{modKeyLabel()}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </CommandFooter>
      </CommandPalette>
    </div>
  );
}
