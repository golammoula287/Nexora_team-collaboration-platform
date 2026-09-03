import { ListSkeleton, Skeleton } from '@nexora/ui';

/**
 * Shaped like the page it replaces. A centred spinner would tell the user
 * nothing about what is coming (docs/UI.md).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <ListSkeleton rows={5} />
    </div>
  );
}
