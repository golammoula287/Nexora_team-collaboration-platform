'use client';

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@nexora/ui';
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  Inbox,
  MessageSquare,
  Plus,
  Settings,
  Target,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  role: string;
}

/** Nav items and the shortcut that jumps to each. */
const NAV = [
  { key: 'inbox', label: 'Inbox', icon: Inbox, shortcut: 'G then I' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, shortcut: 'G then P' },
  { key: 'docs', label: 'Docs', icon: FileText, shortcut: 'G then D' },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'goals', label: 'Goals', icon: Target },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
] as const;

const ADMIN_NAV = [
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'admin', label: 'Members', icon: Users },
] as const;

export function OrgSwitcher({
  organizations,
  current,
}: {
  organizations: OrgSummary[];
  current: OrgSummary;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
            'hover:bg-surface-2 transition-colors',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
          aria-label={`Current organization: ${current.name}. Switch organization`}
        >
          <Avatar name={current.name} src={current.logo} size="sm" />
          <span className="text-fg min-w-0 flex-1 truncate text-[13px] font-medium">
            {current.name}
          </span>
          <ChevronsUpDown className="text-fg-subtle size-3.5 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[15rem]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem key={org.id} asChild>
            <Link href={`/${org.slug}`}>
              <Avatar name={org.name} src={org.logo} size="sm" />
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              {org.slug === current.slug ? (
                <Check className="text-accent size-4" aria-hidden="true" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/new-organization">
            <Plus aria-hidden="true" />
            New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Inbox;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      // aria-current tells a screen reader which page it is on. Colour alone
      // does not.
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] transition-colors',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        active
          ? 'bg-accent-soft text-accent font-medium'
          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function SidebarContent({
  orgSlug,
  organizations,
  current,
  onNavigate,
}: {
  orgSlug: string;
  organizations: OrgSummary[];
  current: OrgSummary;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (key: string) => pathname.startsWith(`/${orgSlug}/${key}`);
  const canAdminister = ['owner', 'admin'].includes(current.role);

  return (
    <div className="flex h-full flex-col gap-1 p-2" onClick={onNavigate}>
      <OrgSwitcher organizations={organizations} current={current} />

      <div className="bg-border my-1 h-px" />

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.key}
            href={`/${orgSlug}/${item.key}`}
            label={item.label}
            icon={item.icon}
            active={isActive(item.key)}
          />
        ))}

        {canAdminister ? (
          <>
            <div className="text-fg-subtle mt-3 px-2 pb-1 text-[11px] font-medium tracking-wider uppercase">
              Manage
            </div>
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.key}
                href={`/${orgSlug}/${item.key}`}
                label={item.label}
                icon={item.icon}
                active={isActive(item.key)}
              />
            ))}
          </>
        ) : null}
      </nav>
    </div>
  );
}

/** The desktop rail. Hidden below `lg`, where the topbar offers a sheet instead. */
export function Sidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="border-border bg-surface-2 hidden w-[240px] shrink-0 border-r lg:block">
      {children}
    </aside>
  );
}
