'use client';

import { ThemeProvider as NextThemes } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Three states, matching docs/UI.md: an explicit light or dark choice, or
 * "system", which follows the OS. next-themes writes the `.dark` class before
 * first paint via a blocking inline script, so there is no flash of the wrong
 * theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="nexora-theme"
    >
      {children}
    </NextThemes>
  );
}
