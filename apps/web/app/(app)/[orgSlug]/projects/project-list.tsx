import { Avatar, Badge, Card, StatusDot } from '@nexora/ui';
import type { ProjectStatus } from '@nexora/shared';
import Link from 'next/link';

export interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  spaceName: string;
  ownerName: string | null;
  ownerImage: string | null;
}

/** Status colour is a signal, never the only signal - StatusDot pairs it with text. */
const TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  planning: 'neutral',
  active: 'accent',
  'on-hold': 'warning',
  done: 'success',
  archived: 'neutral',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // The column is a plain date, so it must not be shifted by a timezone.
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done' || status === 'archived') return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

/**
 * A list rather than a table: below 768px a table would either scroll sideways
 * or crush its columns, and this reads the same at every width (docs/UI.md).
 */
export function ProjectList({
  orgSlug,
  projects,
}: {
  orgSlug: string;
  projects: ProjectSummary[];
}) {
  return (
    <Card>
      <ul className="divide-border divide-y">
        {projects.map((project) => {
          const due = formatDate(project.dueDate);
          const overdue = isOverdue(project.dueDate, project.status);

          return (
            <li key={project.id}>
              <Link
                href={`/${orgSlug}/projects/${project.id}`}
                className="hover:bg-surface-2 focus-visible:outline-ring flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-fg-subtle font-mono text-[12px]">{project.key}</span>
                    <span className="text-fg truncate text-[14px] font-medium">{project.name}</span>
                  </div>
                  {project.description ? (
                    <p className="text-fg-muted mt-0.5 line-clamp-1 text-[13px]">
                      {project.description}
                    </p>
                  ) : null}
                </div>

                <Badge tone="neutral">{project.spaceName}</Badge>

                <StatusDot
                  tone={TONE[project.status] ?? 'neutral'}
                  label={project.status.replace('-', ' ')}
                  className="w-[7.5rem]"
                />

                <span
                  className={`w-[6.5rem] text-[13px] ${overdue ? 'text-danger font-medium' : 'text-fg-muted'}`}
                >
                  {due ? (overdue ? `Overdue ${due}` : due) : '—'}
                </span>

                {project.ownerName ? (
                  <Avatar name={project.ownerName} src={project.ownerImage} size="sm" />
                ) : (
                  <span className="size-6" aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export type { ProjectStatus };
