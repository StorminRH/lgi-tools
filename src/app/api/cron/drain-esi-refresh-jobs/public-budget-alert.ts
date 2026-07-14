import {
  claimPublicEsiBudgetAlert,
  countPublicEsiBudgetExhaustionsSince,
  hasPublicEsiBudgetAlertSince,
  releasePublicEsiBudgetAlertClaim,
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

  // Claim before delivery so a successful webhook always has its marker. If
  // delivery rejects, compensate by releasing this exact row so the next cron
  // can retry the still-active window without reopening delivered alerts.
  const claimId = await claimPublicEsiBudgetAlert({
    count,
    windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
  });
  try {
    const posted = await alertPublicEsiBudgetExhaustion({
      count,
      windowMinutes: PUBLIC_ESI_BUDGET_ALERT_WINDOW_MINUTES,
    });
    if (!posted) {
      await releasePublicEsiBudgetAlertClaim(claimId);
      return { status: 'unconfigured', count };
    }
  } catch (error) {
    await releasePublicEsiBudgetAlertClaim(claimId);
    throw error;
  }
  return { status: 'alerted', count };
}
