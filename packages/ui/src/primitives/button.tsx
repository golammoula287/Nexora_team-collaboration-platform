import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Four variants and no more (docs/UI.md).
 *
 * One `primary` per view. Destructive actions use `danger` AND are confirmed -
 * the variant is a signal, not a safeguard.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    // Icons inside buttons should never capture the pointer or shrink.
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:opacity-90 active:opacity-95',
        secondary:
          'bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        // 32px default; 24px minimum target is met via padding on `icon`.
        sm: 'h-7 px-2.5 text-[13px]',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-9 px-4 text-[14px]',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof button> {
  /** Render as the child element instead of a <button>, e.g. wrapping a Link. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      className={cn(button({ variant, size }), className)}
      // A bare <button> inside a form submits it. Defaulting to "button" makes
      // the submitting case explicit rather than accidental.
      {...(!asChild && !props.type ? { type: 'button' as const } : {})}
      {...props}
    />
  );
}

export { button as buttonVariants };
