'use client';

import {
  Avatar,
  Button,
  Dialog,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MenuShortcut,
  Sheet,
  Tooltip,
} from '@nexora/ui';
import { Bell, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useState } from 'react';
import { modKeyLabel } from '../../hooks/use-keyboard-shortcut';
import { SidebarContent, type OrgSummary } from './sidebar';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.value}
          onSelect={() => setTheme(option.value)}
          // Announces which one is active, rather than relying on a tick that
          // only sighted users see.
          aria-current={theme === option.value ? 'true' : undefined}
        >
          <option.icon aria-hidden="true" />
          {option.label}
          {theme === option.value ? <MenuShortcut>Active</MenuShortcut> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function UserMenu({ user, onSignOut }: { user: CurrentUser; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="focus-visible:outline-ring rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Avatar name={user.name} src={user.image} size="md" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[15rem]">
        <div className="px-2 py-1.5">
          <p className="text-fg truncate text-[13px] font-medium">{user.name}</p>
          <p className="text-fg-muted truncate text-[12px]">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/settings">
            <Settings aria-hidden="true" />
            Preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({
  orgSlug,
  organizations,
  current,
  user,
  breadcrumbs,
  onOpenSearch,
  onSignOut,
  unreadCount = 0,
}: {
  orgSlug: string;
  organizations: OrgSummary[];
  current: OrgSummary;
  user: CurrentUser;
  breadcrumbs: { label: string; href?: string }[];
  onOpenSearch: () => void;
  onSignOut: () => void;
  unreadCount?: number;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="border-border bg-surface flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {/* Below lg the sidebar becomes a sheet rather than a squeezed column. */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <Sheet side="left" aria-label="Navigation">
          <SidebarContent
            orgSlug={orgSlug}
            organizations={organizations}
            current={current}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </Sheet>
      </Dialog>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[13px]">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-fg-subtle">
                    /
                  </span>
                ) : null}
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="text-fg-muted hover:text-fg truncate hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="text-fg truncate font-medium"
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <Tooltip label="Search" shortcut={`${modKeyLabel()} K`}>
        <Button variant="ghost" size="icon" aria-label="Search" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
        </Button>
      </Tooltip>

      <Tooltip label="Notifications">
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={`/${orgSlug}/inbox`}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            className="relative"
          >
            <Bell aria-hidden="true" />
            {unreadCount > 0 ? (
              <span
                aria-hidden="true"
                className="bg-accent absolute top-1.5 right-1.5 size-1.5 rounded-full"
              />
            ) : null}
          </Link>
        </Button>
      </Tooltip>

      <UserMenu user={user} onSignOut={onSignOut} />
    </header>
  );
}
