'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * The command palette shell.
 *
 * Presentation only - what goes in it is the app's business. cmdk handles the
 * filtering, roving focus and ARIA combobox wiring; Radix's Dialog supplies the
 * focus trap and Escape handling.
 */

export function CommandPalette({
  open,
  onOpenChange,
  children,
  label = 'Command palette',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          aria-label={label}
          className={cn(
            'fixed top-[15vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
            'border-border bg-surface shadow-dialog overflow-hidden rounded-lg border',
            'focus:outline-none',
          )}
        >
          {/* Radix requires a title for the dialog; visually redundant here. */}
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <Command loop label={label}>
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function CommandInput({
  placeholder = 'Search or jump to…',
  ...props
}: {
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <div className="border-border flex items-center border-b px-3">
      <Command.Input
        placeholder={placeholder}
        className={cn(
          'text-fg h-12 w-full bg-transparent text-[14px] outline-none',
          'placeholder:text-fg-subtle',
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ children }: { children: ReactNode }) {
  return (
    <Command.List className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain p-1">
      {children}
    </Command.List>
  );
}

export function CommandEmpty({ children = 'No results.' }: { children?: ReactNode }) {
  return (
    <Command.Empty className="text-fg-muted px-3 py-8 text-center text-[13px]">
      {children}
    </Command.Empty>
  );
}

export function CommandGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className={cn(
        'px-1 py-1',
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
        '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium',
        '[&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase',
        '[&_[cmdk-group-heading]]:text-fg-subtle',
      )}
    >
      {children}
    </Command.Group>
  );
}

export function CommandItem({
  children,
  onSelect,
  value,
  shortcut,
  icon,
}: {
  children: ReactNode;
  onSelect?: () => void;
  value?: string;
  shortcut?: string;
  icon?: ReactNode;
}) {
  return (
    <Command.Item
      // exactOptionalPropertyTypes: spread the optionals so an absent prop is
      // absent rather than explicitly undefined.
      {...(value === undefined ? {} : { value })}
      {...(onSelect === undefined ? {} : { onSelect })}
      className={cn(
        'flex cursor-default items-center gap-2.5 rounded-sm px-2 py-2 select-none',
        'text-fg text-[13px] outline-none',
        'data-[selected=true]:bg-surface-2',
        '[&_svg]:text-fg-muted [&_svg]:size-4 [&_svg]:shrink-0',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? (
        <span className="text-fg-subtle font-mono text-[11px] tracking-wider">{shortcut}</span>
      ) : null}
    </Command.Item>
  );
}

/** Footer hint strip, so the shortcuts are discoverable rather than folklore. */
export function CommandFooter({ children }: { children: ReactNode }) {
  return (
    <div className="border-border text-fg-subtle flex items-center gap-3 border-t px-3 py-2 text-[11px]">
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'border-border inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border',
        'bg-surface-2 text-fg-muted px-1 font-mono text-[10px]',
      )}
    >
      {children}
    </kbd>
  );
}
