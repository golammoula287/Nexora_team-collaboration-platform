import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting a caller's classes win over a component's
 * defaults without specificity fights. `twMerge` resolves conflicts inside a
 * Tailwind group, so `cn('px-4', 'px-2')` yields `px-2` rather than both.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
