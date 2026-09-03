import { serverApi } from '../lib/api.server';
import { API_URL } from '../lib/env';

/**
 * Phase 0 placeholder. It exists to prove one thing: the frontend can reach the
 * backend and the response is typed end to end. Phase 3 replaces it with the
 * real landing page in app/(marketing).
 *
 * Rendered per request - a build-time prerender would need the API running.
 */
export const dynamic = 'force-dynamic';

type HealthResult =
  | {
      ok: true;
      data: { service: string; environment: string; uptimeSeconds: number; time: string };
    }
  | { ok: false; message: string };

async function checkApi(): Promise<HealthResult> {
  try {
    const api = await serverApi();
    const res = await api.health.$get();

    if (!res.ok) {
      return { ok: false, message: `API responded ${res.status}` };
    }

    // Typed from the route definition in apps/api - no cast, no codegen.
    const data = await res.json();
    return {
      ok: true,
      data: {
        service: data.service,
        environment: data.environment,
        uptimeSeconds: data.uptimeSeconds,
        time: data.time,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-6 border-b py-2 last:border-0">
      <dt className="text-fg-muted text-[12px] font-medium">{label}</dt>
      <dd className="text-fg font-mono text-[13px]">{value}</dd>
    </div>
  );
}

export default async function Page() {
  const health = await checkApi();

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-xl font-semibold tracking-tight">Nexora</h1>
        <p className="text-fg-muted mt-1 text-[13px]">
          Phase 0 — foundations. Frontend and backend are separate apps joined by a typed contract.
        </p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="border-border bg-surface rounded-md border p-4"
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${health.ok ? 'bg-success' : 'bg-danger'}`}
          />
          <h2 id="status-heading" className="text-[16px] font-semibold">
            {health.ok ? 'API reachable' : 'API unreachable'}
          </h2>
        </div>

        {health.ok ? (
          <dl>
            <Row label="Service" value={health.data.service} />
            <Row label="Environment" value={health.data.environment} />
            <Row label="Uptime" value={`${health.data.uptimeSeconds}s`} />
            <Row label="Checked at" value={health.data.time} />
          </dl>
        ) : (
          <div className="space-y-3">
            <p className="text-fg-muted text-[13px]">{health.message}</p>
            <p className="text-fg-muted text-[13px]">
              Start the backend with <code className="text-fg font-mono">pnpm dev:api</code>, or
              check that <code className="text-fg font-mono">NEXT_PUBLIC_API_URL</code> points at{' '}
              <span className="text-fg font-mono">{API_URL}</span>.
            </p>
          </div>
        )}
      </section>

      <p className="text-fg-subtle mt-6 text-[12px]">
        This page is a placeholder. Phase 3 replaces it with the marketing landing page.
      </p>
    </main>
  );
}
