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

interface OpsAlertEmbed {
  title: string;
  description: string;
  fields?: ReadonlyArray<{ name: string; value: string; inline?: boolean }>;
}

function opsAlertWebhookUrl(): string | undefined {
  return readEnv('DISCORD_ALERT_WEBHOOK_URL');
}

export function isOpsAlertConfigured(): boolean {
  return Boolean(opsAlertWebhookUrl());
}

/**
 * Posts one embed, stamped with the app version and send time, to the ops
 * webhook. Resolves false when no webhook is configured and true once Discord
 * accepts the post; rejects on a non-2xx so the caller's bestEffort logs it.
 */
async function sendOpsAlert(embed: OpsAlertEmbed): Promise<boolean> {
  const url = opsAlertWebhookUrl();
  if (!url) return false;

  const response = await postDiscordWebhook(url, {
    embeds: [
      {
        ...embed,
        footer: { text: `LGI.tools v${APP_VERSION}` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
  if (!response.ok) {
    throw new Error(`Ops alert webhook returned ${response.status}`);
  }
  return true;
}

export async function alertPriceSourceDegradation(
  info: PriceSourceDegradation,
): Promise<void> {
  const fallbackPct =
    info.fetched > 0
      ? Math.round((info.fuzzworkFallbackCount / info.fetched) * 100)
      : 0;
  await sendOpsAlert({
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
  });
}

export async function alertEsiRefreshDeadLetter(
  info: EsiRefreshDeadLetter,
): Promise<void> {
  await sendOpsAlert({
    title: 'Deferred ESI refresh dead-lettered',
    description: `Job ${info.jobId} exhausted its retry budget and needs operator review.`,
    fields: [
      { name: 'Dataset', value: info.dataset, inline: true },
      { name: 'Attempts', value: String(info.attemptCount), inline: true },
      { name: 'Resource', value: info.resource },
      { name: 'Failure', value: info.failureCode },
    ],
  });
}

/** Resolves false when no webhook is configured, so the caller can tell an unsent alert apart. */
export function alertPublicEsiBudgetExhaustion(
  info: PublicEsiBudgetExhaustion,
): Promise<boolean> {
  return sendOpsAlert({
    title: 'Public ESI refreshes are repeatedly budget-blocked',
    description: `${info.count} public refresh requests hit the shared ESI gate in the last ${info.windowMinutes} minutes. Stored data or the existing price fallback kept responses available.`,
  });
}
