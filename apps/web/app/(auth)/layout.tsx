import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Auth screens: a single centred column, no chrome, nothing to click except
 * the task at hand. Works at 360px without a horizontal scrollbar.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-bg flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main id="main" className="w-full max-w-[380px]">
        <Link
          href="/"
          className="text-fg mb-8 block text-center text-[15px] font-semibold tracking-tight"
        >
          Nexora
        </Link>
        {children}
      </main>

      <footer className="text-fg-subtle mt-8 text-center text-[12px]">
        <Link href="/pricing" className="hover:text-fg-muted hover:underline">
          Pricing
        </Link>
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <Link href="/changelog" className="hover:text-fg-muted hover:underline">
          Changelog
        </Link>
      </footer>
    </div>
  );
}
