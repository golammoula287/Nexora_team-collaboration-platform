'use client';

import { ErrorState } from '@nexora/ui';
import { useEffect } from 'react';

/**
 * Route-level error boundary. `reset` re-renders the segment, which is usually
 * enough for a transient failure.
 */
export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry takes over here in phase 9.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      onRetry={reset}
      // The message can carry internals, so it is shown only in development.
      {...(process.env.NODE_ENV === 'development' ? { detail: error.message } : {})}
    />
  );
}
