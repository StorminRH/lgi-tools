import { APP_VERSION } from '@/config/app-version';
import { postDiscordWebhook } from '@/lib/discord';
import { readEnv } from '@/lib/env';

export interface PriceSourceDegradation {
  fetched: number;
  esiCount: number;
  fuzzworkFallbackCount: number;
  budgetExhausted: boolean;
}

// Best-effort ops alert when the price source degrades to Fuzzwork (3.0.10
// O-1). Reads DISCORD_ALERT_WEBHOOK_URL — a dedicated ops channel, separate
// from the feedback webhook. If it is unset, returns silently: the alert sits
// on top of the O-1 telemetry event, never as a hard dependency. Fired only
// from the cron path (not the public on-demand route) so a public endpoint
// can't drive Discord posts. Callers invoke it fire-and-forget, so a Discord
// failure never breaks the cron.
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
