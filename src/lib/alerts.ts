import { APP_VERSION } from '@/config/app-version';
import { postDiscordWebhook } from '@/lib/discord';
import { readEnv } from '@/lib/env';

/** Where a price read's rows came from: priced rows, ESI rows, Fuzzwork fallback rows, and whether ESI's budget ran out. */
export interface PriceSourceCounts {
  fetched: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

interface OpsAlertEmbed {
  title: string;
  description: string;
  fields?: ReadonlyArray<{ name: string; value: string; inline?: boolean }>;
}

function opsAlertWebhookUrl(): string | undefined {
  return readEnv('DISCORD_ALERT_WEBHOOK_URL');
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
  info: PriceSourceCounts,
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
