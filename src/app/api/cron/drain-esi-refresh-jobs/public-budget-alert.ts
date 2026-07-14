import {
  countPublicEsiBudgetExhaustionsSince,
  hasPublicEsiBudgetAlertSince,
  logUsageEvent,
} from '@/data/telemetry/queries';
import { alertPublicEsiBudgetExhaustion, isOpsAlertConfigured } from '@/lib/alerts';

export const PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES = 15;
export const PUBLIC_ESI_BUDGET_ALERT_THRESHOLD = 3;

export type PublicBudgetAlertResult =
  | { status: 'below-threshold'; count: number }
  | { status: 'already-alerted'; count: number }
  | { status: 'unconfigured'; count: number }
  | { status: 'alerted'; count: number };

export async function maybeAlertPublicEsiBudgetExhaustion(
  now: Date = new Date(),
): Promise<PublicBudgetAlertResult> {
  const since = new Date(
    now.getTime() - PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES * 60_000,
  );
  const count = await countPublicEsiBudgetExhaustionsSince(since);
  if (count < PUBLIC_ESI_BUDGET_ALERT_THRESHOLD) {
    return { status: 'below-threshold', count };
  }
  if (await hasPublicEsiBudgetAlertSince(since)) {
    return { status: 'already-alerted', count };
  }
  if (!isOpsAlertConfigured()) return { status: 'unconfigured', count };

  // Claim the window before delivery. A failed marker write leaves the alert
  // retryable; a successful webhook can never be followed by a missing marker
  // that permits a duplicate delivery on the next cron run.
  await logUsageEvent({
    action: 'public_esi_budget_alerted',
    metadata: { count, windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES },
  });
  await alertPublicEsiBudgetExhaustion({
    count,
    windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
  });
  return { status: 'alerted', count };
}
