import { EmptyState } from '@nexora/ui';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        className="w-full"
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={{ label: 'Back to Nexora', href: '/' }}
      />
    </main>
  );
}
