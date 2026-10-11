import { after } from 'next/server';
import { bestEffort } from './best-effort';
import type { WorkDeferrer } from './deferred-work';

type Scheduled = { ok: true } | { ok: false; error: unknown };

/**
 * Hands `task` to Next's after(), which keeps the invocation alive until it
 * settles. after() throws instead when there is no request scope to extend.
 */
function scheduleAfter(task: () => Promise<unknown>): Scheduled {
  try {
    after(task);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Runs best-effort work after the response. A rejection is logged as
 * `[scope] label write failed`. When after() throws, the work is dropped,
 * never run inline, and `[scope] label scheduling failed` is logged.
 */
export function runAfterResponse(scope: string, label: string, task: () => Promise<unknown>): void {
  const scheduled = scheduleAfter(() => bestEffort(scope, `${label} write`, null, task));
  if (!scheduled.ok) console.error(`[${scope}] ${label} scheduling failed`, scheduled.error);
}

/**
 * The deferrer Next installs behind deferWork. It declines when after()
 * throws, so deferWork runs the task inline: that bookkeeping (ESI budget
 * reports, resolved names) is shared with Convex and scripts and is never
 * dropped, unlike runAfterResponse's writes.
 */
export const deferAfterResponse: WorkDeferrer = (task) => scheduleAfter(task).ok;
