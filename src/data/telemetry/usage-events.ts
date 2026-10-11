import { runAfterResponse } from '@/lib/after-response';
import { bestEffort } from '@/lib/best-effort';
import { logUsageEvent, type UsageEventInput } from './log';

/**
 * Writes one usage event now, for owners that record before they respond or
 * run outside a request (crons, instrumentation). It never rejects: a failed
 * write is logged as `[scope] telemetry write failed`.
 */
export function recordUsageEvent(scope: string, input: UsageEventInput): Promise<void> {
  return bestEffort(scope, 'telemetry write', null, () => logUsageEvent(input));
}

/**
 * Writes one usage event after the response, through runAfterResponse. A lazy
 * input is resolved inside the scheduled task, so a lookup it needs (the
 * session, say) never delays the response; it must not read request headers
 * or cookies unless the caller is a Route Handler or Server Function.
 */
export function emitUsageEvent(
  scope: string,
  input: UsageEventInput | (() => Promise<UsageEventInput>),
): void {
  runAfterResponse(scope, 'telemetry', () =>
    typeof input === 'function' ? input().then(logUsageEvent) : logUsageEvent(input),
  );
}
