import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Skeleton } from '../primitives/skeleton';

/**
 * Empty, error and loading states.
 *
 * These live in the design system rather than being rewritten per screen so
 * that shipping them alongside the happy path is the easy option. docs/UI.md
 * requires all three on every view; the legacy app shipped blank panels.
 */

/*
 * Optional props are declared `?: T | undefined` rather than `?: T`.
 *
 * With exactOptionalPropertyTypes, `?: string` means "absent, or a string" -
 * so passing `description={maybeUndefined}` is an error at every call site.
 * Since a design-system component is called from everywhere, the type belongs
 * here rather than a spread workaround in each caller.
 */
export interface EmptyStateProps {
  /** One line of what goes here. Not a paragraph. */
  title: string;
  description?: string | undefined;
  /** One primary action. An empty state without a way out is a dead end. */
  action?: { label: string; onClick?: () => void; href?: string } | undefined;
  /** Small by design - no illustration larger than 96px. */
  icon?: ReactNode | undefined;
  className?: string | undefined;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed',
        'border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-fg-subtle [&_svg]:size-8">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-fg text-[14px] font-medium">{title}</p>
        {description ? (
          <p className="text-fg-muted mx-auto max-w-sm text-[13px]">{description}</p>
        ) : null}
      </div>
      {action ? (
        action.href ? (
          <Button variant="primary" size="sm" asChild>
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string | undefined;
  description?: string | undefined;
  /** Wired to Next's error boundary `reset`. */
  onRetry?: (() => void) | undefined;
  /** Shown only in development - never leak internals to a user. */
  detail?: string | undefined;
  className?: string | undefined;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The page could not be loaded. Trying again often works.',
  onRetry,
  detail,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'border-border flex flex-col items-center justify-center gap-3 rounded-md border',
        'bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-fg text-[14px] font-medium">{title}</p>
        <p className="text-fg-muted mx-auto max-w-sm text-[13px]">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {detail ? (
        <pre className="bg-surface-2 text-fg-muted mt-2 max-w-full overflow-x-auto rounded-sm p-3 text-left font-mono text-[11px]">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}

/** A list skeleton shaped like the rows it replaces. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-border flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Page heading with an optional action, used at the top of every app screen. */
export function PageHeader({
  title,
  description,
  action,
  className,
  ...props
}: ComponentProps<'header'> & {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-start justify-between gap-3', className)}
      {...props}
    >
      <div className="space-y-1">
        <h1 className="text-fg text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-fg-muted text-[13px]">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </header>
  );
}
