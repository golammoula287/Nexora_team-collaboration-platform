import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-fg-muted',
        accent: 'bg-accent-soft text-accent',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/**
 * Status is a filled dot PLUS a text label - never colour alone, which is
 * invisible to a colour-blind user and to anyone printing in greyscale.
 */
export function StatusDot({
  tone = 'neutral',
  label,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  label: string;
  className?: string;
}) {
  const colour = {
    neutral: 'bg-fg-subtle',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }[tone];

  return (
    <span className={cn('text-fg inline-flex items-center gap-1.5 text-[13px]', className)}>
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', colour)} />
      {label}
    </span>
  );
}
