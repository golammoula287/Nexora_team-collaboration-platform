'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Avatars fall back to initials rather than a broken image or a generic
 * silhouette. The colour comes from a fixed 8-hue set keyed off the name, so
 * the same person is always the same colour and none of them compete with the
 * accent (docs/UI.md).
 */
const HUES = [
  'bg-[#e0e7ff] text-[#3730a3] dark:bg-[#312e81] dark:text-[#c7d2fe]',
  'bg-[#cffafe] text-[#155e75] dark:bg-[#164e63] dark:text-[#a5f3fc]',
  'bg-[#dcfce7] text-[#166534] dark:bg-[#14532d] dark:text-[#bbf7d0]',
  'bg-[#fef3c7] text-[#92400e] dark:bg-[#78350f] dark:text-[#fde68a]',
  'bg-[#fee2e2] text-[#991b1b] dark:bg-[#7f1d1d] dark:text-[#fecaca]',
  'bg-[#f3e8ff] text-[#6b21a8] dark:bg-[#581c87] dark:text-[#e9d5ff]',
  'bg-[#ffe4e6] text-[#9f1239] dark:bg-[#881337] dark:text-[#fecdd3]',
  'bg-[#e2e8f0] text-[#334155] dark:bg-[#334155] dark:text-[#e2e8f0]',
];

function hueFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return HUES[Math.abs(hash) % HUES.length] as string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return ((parts[0] as string)[0] ?? '') + ((parts[parts.length - 1] as string)[0] ?? '');
}

export interface AvatarProps extends ComponentProps<typeof AvatarPrimitive.Root> {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const dimensions = {
    sm: 'size-6 text-[10px]',
    md: 'size-8 text-[11px]',
    lg: 'size-10 text-[13px]',
  }[size];

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full select-none',
        dimensions,
        className,
      )}
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          // The name is on the fallback; an alt here would double-announce it.
          alt=""
          className="aspect-square size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        className={cn('flex size-full items-center justify-center font-medium', hueFor(name))}
      >
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
