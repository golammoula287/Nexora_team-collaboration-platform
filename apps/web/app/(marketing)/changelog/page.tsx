import { EmptyState } from '@nexora/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Changelog' };

export default function Page() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-fg mb-6 text-2xl font-semibold tracking-tight">Changelog</h1>
      <EmptyState
        title="Not written yet"
        description="This page arrives with billing in phase 8. It exists now so no link in the app points at a route that does not resolve."
        action={{ label: 'Back home', href: '/' }}
      />
    </main>
  );
}
