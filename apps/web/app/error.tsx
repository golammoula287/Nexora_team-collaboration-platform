'use client';

import { ErrorState } from '@nexora/ui';
import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <ErrorState
        className="w-full"
        onRetry={reset}
        {...(process.env.NODE_ENV === 'development' ? { detail: error.message } : {})}
      />
    </main>
  );
}
