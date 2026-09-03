'use client';

import { TooltipProvider } from '@nexora/ui';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';

/** Everything the tree needs at the root, in one place. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300} skipDelayDuration={200}>
        {children}
        <Toaster
          position="bottom-right"
          duration={4000}
          // Inherit the app's tokens rather than sonner's own palette.
          toastOptions={{
            classNames: {
              toast: 'rounded-md border border-border bg-surface text-fg shadow-pop text-[13px]',
              description: 'text-fg-muted',
              actionButton: 'bg-accent text-accent-fg rounded-sm text-[12px]',
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
