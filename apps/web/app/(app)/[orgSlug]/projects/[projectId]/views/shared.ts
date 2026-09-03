'use client';

import { toast } from 'sonner';
import { api } from '../../../../../../lib/api';

/**
 * State and helpers the four views share.
 *
 * The views differ in how they arrange tasks, not in what a task is or how it
 * moves - so the move call, the tone maps and the date handling live here
 * rather than being written four slightly different ways.
 */

export interface ViewTask {
  id: string;
  number: number;
  title: string;
  priority: string;
  statusId: string | null;
  statusName: string | null;
  statusCategory: string | null;
  projectKey: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  parentTaskId: string | null;
  estimateMinutes: number | null;
  assignees: { userId: string; name: string; image: string | null }[];
}

export interface ViewColumn {
  id: string;
  name: string;
  category: string;
}

export const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

/** Priority order for sorting: urgent first. */
export const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(task: ViewTask): boolean {
  if (!task.dueDate || task.completedAt) return false;
  return task.dueDate < today();
}

/** Parses a plain YYYY-MM-DD without letting the local timezone shift it. */
export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

/**
 * A fixed locale, not the viewer's.
 *
 * `undefined` resolves to Node's locale on the server and the browser's on the
 * client. When they differ the two renders disagree and React throws away the
 * server HTML - a hydration mismatch that only appears for some users. The app
 * is English-only; when it is localised this becomes a real locale from the
 * request, chosen in one place and passed down.
 */
export const DATE_LOCALE = 'en-US';

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return parseDate(value).toLocaleDateString(DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Moves a task, sending only its new neighbours.
 *
 * The server derives the fractional index from them and writes one row. Sending
 * a computed position from the client would let two people racing a drag write
 * conflicting keys.
 */
export async function moveTask(
  orgSlug: string,
  taskId: string,
  body: { statusId?: string | null; beforeTaskId?: string | null; afterTaskId?: string | null },
): Promise<boolean> {
  const response = await api.orgs[':orgSlug'].tasks[':taskId'].move.$post({
    param: { orgSlug, taskId },
    json: body,
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    toast.error(payload.error?.message ?? 'Could not move that task.');
    return false;
  }
  return true;
}

/** Updates a single field, used by inline edit in the list view. */
export async function patchTask(
  orgSlug: string,
  taskId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const response = await api.orgs[':orgSlug'].tasks[':taskId'].$patch({
    param: { orgSlug, taskId },
    json: patch,
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    toast.error(payload.error?.message ?? 'Could not save that change.');
    return false;
  }
  return true;
}
