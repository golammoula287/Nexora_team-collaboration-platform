'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * A tooltip is a hint, never the only way to learn something. Icon-only
 * buttons carry an aria-label as well - a tooltip is not announced on focus in
 * every screen reader, and never appears on touch at all.
 */
export function Tooltip({
  children,
  label,
  side = 'bottom',
  shortcut,
}: {
  children: ReactNode;
  label: string;
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
  shortcut?: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'border-border bg-surface z-50 flex items-center gap-2 rounded-sm border px-2 py-1',
            'text-fg shadow-pop text-[12px]',
          )}
        >
          {label}
          {shortcut ? (
            <span className="text-fg-subtle font-mono text-[11px]">{shortcut}</span>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
