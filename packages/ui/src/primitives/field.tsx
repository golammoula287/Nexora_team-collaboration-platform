'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * A labelled form control.
 *
 * This exists so that a labelled, described, error-announced input is the path
 * of least resistance. The audit of the legacy app found unlabelled inputs in
 * its most-used form primitive; making the correct wiring automatic is a more
 * durable fix than remembering to add `htmlFor` each time.
 *
 * It generates the ids and wires `htmlFor`, `aria-describedby` and
 * `aria-invalid` itself. The child is a render prop so any control can use it.
 *
 *   <Field label="Email" error={errors.email?.message}>
 *     {(props) => <Input type="email" {...props} />}
 *   </Field>
 */
export interface FieldProps {
  label: string;
  /** Shown under the label; also announced via aria-describedby. */
  hint?: string | undefined;
  /** Shown in danger text and announced. Presence sets aria-invalid. */
  error?: string | undefined;
  /** Marked in text, never by colour alone. */
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    required: boolean | undefined;
  }) => ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-fg-subtle ml-1">(required)</span> : null}
      </Label>

      {hint ? (
        <p id={hintId} className="text-fg-muted text-[12px]">
          {hint}
        </p>
      ) : null}

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}

      {error ? (
        // Announced when it appears, so a screen reader user learns about a
        // validation failure without re-reading the form.
        <p id={errorId} role="alert" className="text-danger text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-fg block text-[12px] font-medium select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
