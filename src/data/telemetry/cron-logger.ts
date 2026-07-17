// Awaited fire-and-forget cron telemetry, one factory instead of a per-route
// copy: the structured boundary line surfaces in Vercel runtime logs; the
// usage row is swallowed so observability never breaks the cron, and awaited
// so it lands before the function freezes (3.0.10 O-2). Each cron instantiates
// its own logger, so scopes and actions stay per-cron.
import { logUsageEvent } from './queries';
import type { UsageAction } from './types';

/**
 * Creates the standard structured cron logger for one job and run identifier; callers own emitting
 * start, outcome, and failure events.
 */
export function cronLogger(
  scope: string,
  action: UsageAction,
): (metadata: Record<string, unknown>) => Promise<void> {
  return async (metadata) => {
    console.log(JSON.stringify({ scope, ...metadata }));
    try {
      await logUsageEvent({ action, metadata });
    } catch (err) {
      console.error(`[${scope}] telemetry write failed`, err);
    }
  };
}
