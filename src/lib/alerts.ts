import { APP_VERSION } from '@/config/app-version';
import { postDiscordWebhook } from '@/lib/discord';
import { readEnv } from '@/lib/env';

export interface PriceSourceDegradation {
  fetched: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

export interface EsiRefreshDeadLetter {
  jobId: number;
  dataset: string;
  resource: string;
  attemptCount: number;
  failureCode: string;
}

export interface PublicEsiBudgetExhaustion {
  count: number;
  windowMinutes: number;
}

export function isOpsAlertConfigured(): boolean {
  return Boolean(readEnv('DISCORD_ALERT_WEBHOOK_URL'));
}

/**
 * Best-effort ops alert when the price source degrades to Fuzzwork (3.0.10
 * O-1). Reads DISCORD_ALERT_WEBHOOK_URL — a dedicated ops channel, separate
 * from the feedback webhook. If it is unset, returns silently: the alert sits
 * on top of the O-1 telemetry event, never as a hard dependency. Fired only
 * from the cron path (not the public on-demand route) so a public endpoint
 * can't drive Discord posts. Callers invoke it fire-and-forget, so a Discord
 * failure never breaks the cron.
 */
export async function alertPriceSourceDegradation(
  info: PriceSourceDegradation,
): Promise<void> {
  const url = readEnv('DISCORD_ALERT_WEBHOOK_URL');
  if (!url) return;

  const fallbackPct =
    info.fetched > 0
      ? Math.round((info.fuzzworkFallbackCount / info.fetched) * 100)
      : 0;
  const embed = {
    title: info.budgetExhausted
      ? 'Price source degraded — ESI error budget exhausted'
      : 'Price source degraded — ESI fell back to Fuzzwork',
    description: `${info.fuzzworkFallbackCount}/${info.fetched} priced rows (${fallbackPct}%) served by the Fuzzwork fallback.`,
    fields: [
      {
        name: 'Budget exhausted',
        value: info.budgetExhausted ? 'yes' : 'no',
        inline: true,
      },
      {
        name: 'ESI / fallback',
        value: `${info.esiCount} / ${info.fuzzworkFallbackCount}`,
        inline: true,
      },
    ],
    footer: { text: `LGI.tools v${APP_VERSION}` },
    timestamp: new Date().toISOString(),
  };

  await postDiscordWebhook(url, { embeds: [embed] });
}

export async function alertEsiRefreshDeadLetter(
  info: EsiRefreshDeadLetter,
): Promise<void> {
  const url = readEnv('DISCORD_ALERT_WEBHOOK_URL');
  if (!url) return;

  await postDiscordWebhook(url, {
    embeds: [
      {
        title: 'Deferred ESI refresh dead-lettered',
        description: `Job ${info.jobId} exhausted its retry budget and needs operator review.`,
        fields: [
          { name: 'Dataset', value: info.dataset, inline: true },
          { name: 'Attempts', value: String(info.attemptCount), inline: true },
          { name: 'Resource', value: info.resource },
          { name: 'Failure', value: info.failureCode },
        ],
        footer: { text: `LGI.tools v${APP_VERSION}` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function alertPublicEsiBudgetExhaustion(
  info: PublicEsiBudgetExhaustion,
): Promise<boolean> {
  const url = readEnv('DISCORD_ALERT_WEBHOOK_URL');
  if (!url) return false;

  const response = await postDiscordWebhook(url, {
    embeds: [
      {
        title: 'Public ESI refreshes are repeatedly budget-blocked',
        description: `${info.count} public refresh requests hit the shared ESI gate in the last ${info.windowMinutes} minutes. Stored data or the existing price fallback kept responses available.`,
        footer: { text: `LGI.tools v${APP_VERSION}` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
  if (!response.ok) {
    throw new Error(`Public ESI budget alert webhook returned ${response.status}`);
  }
  return true;
}
