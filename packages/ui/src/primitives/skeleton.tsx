import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Skeletons match the shape of the real content. A centred spinner on a full
 * page tells the user nothing about what is coming (docs/UI.md).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-surface-2 animate-pulse rounded-sm', className)}
      {...props}
    />
  );
}

/** For the rare case where a spinner is right: inside a button, mid-action. */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label}>
      <svg
        className={cn('size-4 animate-spin text-current', className)}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
