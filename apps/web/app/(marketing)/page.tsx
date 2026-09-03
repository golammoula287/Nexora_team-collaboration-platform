import { Button, Card, CardContent } from '@nexora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '../../lib/api.server';

export const metadata: Metadata = {
  title: 'Nexora — AI-native team collaboration',
};

/** Rendered per request so the status strip reflects the live API. */
export const dynamic = 'force-dynamic';

async function apiStatus(): Promise<{ ok: boolean; label: string }> {
  try {
    const api = await serverApi();
    const response = await api.health.$get();
    if (!response.ok) return { ok: false, label: `API responded ${response.status}` };
    const data = await response.json();
    return { ok: true, label: `API up · ${data.environment}` };
  } catch {
    return { ok: false, label: 'API unreachable' };
  }
}

export default async function LandingPage() {
  const status = await apiStatus();

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-accent mb-3 text-[13px] font-medium">Nexora</p>

      <h1 className="text-fg max-w-2xl text-4xl leading-tight font-semibold tracking-tight">
        Projects, docs and conversations in one place — with an AI that has actually read them.
      </h1>

      <p className="text-fg-muted mt-4 max-w-xl text-[15px] leading-relaxed">
        A multi-tenant work platform for teams of 10 to 200. Tasks, boards, documents, files and a
        light CRM, joined by an assistant grounded in your own workspace.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" asChild>
          <Link href="/sign-up">Create an account</Link>
        </Button>
        <Button variant="secondary" size="lg" asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>

      <Card className="mt-16">
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 pt-4">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${status.ok ? 'bg-success' : 'bg-danger'}`}
          />
          <span className="text-fg text-[13px]">{status.label}</span>
          <span className="text-fg-subtle text-[13px]">
            Build status: phases 0–2 complete, shell in progress.
          </span>
        </CardContent>
      </Card>
    </main>
  );
}
