import {
  claimPublicEsiBudgetAlert,
  completePublicEsiBudgetAlertClaim,
  countPublicEsiBudgetExhaustionsInWindow,
  hasPublicEsiBudgetAlertForWindow,
} from '@/data/telemetry/queries';
import { emitDomainEvent } from '@/data/domain-events/queries';
import { alertPublicEsiBudgetExhaustion, isOpsAlertConfigured } from '@/lib/alerts';

/**
 * Canonical App Router policy for public esi budget alert window minutes; consumers derive
 * behavior from this single ordered definition. Values are minutes.
 */
export const PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES = 15;
/**
 * Canonical App Router policy for public esi budget alert threshold; consumers derive behavior
 * from this single ordered definition.
 */
export const PUBLIC_ESI_BUDGET_ALERT_THRESHOLD = 3;

/**
 * Stable App Router outcome returned across the owning boundary; callers handle the represented
 * success, absence, or failure states.
 */
export type PublicBudgetAlertResult =
  | { status: 'below-threshold'; count: number }
  | { status: 'already-alerted'; count: number }
  | { status: 'unconfigured'; count: number }
  | { status: 'alerted'; count: number };

/**
 * Sends at most one public ESI budget alert for the current 15-minute window when the configured
 * exhaustion threshold is met; otherwise reports the skipped reason.
 */
export async function maybeAlertPublicEsiBudgetExhaustion(
  now: Date = new Date(),
): Promise<PublicBudgetAlertResult> {
  const windowMs = PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES * 60_000;
  const windowEndedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const windowStartedAt = new Date(windowEndedAt.getTime() - windowMs);
  const windowStartedAtIso = windowStartedAt.toISOString();
  const count = await countPublicEsiBudgetExhaustionsInWindow(
    windowStartedAt,
    windowEndedAt,
  );
  if (count < PUBLIC_ESI_BUDGET_ALERT_THRESHOLD) {
    return { status: 'below-threshold', count };
  }
  if (await hasPublicEsiBudgetAlertForWindow(windowStartedAtIso)) {
    return { status: 'already-alerted', count };
  }
  if (!isOpsAlertConfigured()) return { status: 'unconfigured', count };

  // Claim this exact completed window before delivery. Pending and delivered
  // claims suppress only that fixed window, so an interrupted completion cannot
  // duplicate it and a failed delivery cannot block the next window.
  const claimId = await claimPublicEsiBudgetAlert({
    count,
    windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
    windowStartedAt: windowStartedAtIso,
    windowEndedAt: windowEndedAt.toISOString(),
  });
  const posted = await alertPublicEsiBudgetExhaustion({
    count,
    windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
  });
  if (!posted) {
    return { status: 'unconfigured', count };
  }
  await completePublicEsiBudgetAlertClaim(claimId);
  emitDomainEvent({
    eventType: 'esi_budget_guard_exhausted',
    metadata: {
      count,
      windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
      windowStartedAt: windowStartedAtIso,
      windowEndedAt: windowEndedAt.toISOString(),
    },
  });
  return { status: 'alerted', count };
}
