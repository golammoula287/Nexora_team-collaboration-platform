import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Inputs always have a visible <label> (see Field). Placeholders are examples,
 * never labels - the legacy app's most-used form primitive had no label at all.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'border-border bg-surface text-fg h-[34px] w-full rounded-sm border px-2.5 text-[13px]',
        'placeholder:text-fg-subtle',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-border bg-surface text-fg min-h-20 w-full rounded-sm border px-2.5 py-2 text-[13px]',
        'placeholder:text-fg-subtle',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger',
        className,
      )}
      {...props}
    />
  );
}
