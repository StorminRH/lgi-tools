import { afterEach, expect, test, vi } from 'vitest';

import { APP_VERSION } from '@/config/app-version';

const postDiscordWebhookMock = vi.fn();

vi.mock('@/lib/discord', () => ({
  postDiscordWebhook: (...args: unknown[]) => postDiscordWebhookMock(...args),
}));

import { alertPriceSourceDegradation } from './alerts';

const WEBHOOK = 'https://discord.test/webhook';
const SENT_AT = '2026-05-04T03:02:01.000Z';
const STAMP = { footer: { text: `LGI.tools v${APP_VERSION}` }, timestamp: SENT_AT };
const PRICE_INFO = { fetched: 10, esiCount: 6, fuzzworkFallbackCount: 4, budgetExhausted: true };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** Points the alerts at `url` ('' for unset) and fixes Discord's answer and the send time. */
function webhook(url: string, status = 204): void {
  vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', url);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(SENT_AT) });
  postDiscordWebhookMock.mockReset();
  postDiscordWebhookMock.mockImplementation(() =>
    Promise.resolve(new Response(null, { status })),
  );
}

function postedEmbeds(): unknown[] {
  expect(postDiscordWebhookMock).toHaveBeenCalledOnce();
  const [url, payload] = postDiscordWebhookMock.mock.calls[0] as [string, { embeds: unknown[] }];
  expect(url).toBe(WEBHOOK);
  return payload.embeds;
}

test('price degradation alert skips an unset webhook and posts the fallback share', async () => {
  webhook('');
  await alertPriceSourceDegradation(PRICE_INFO);
  expect(postDiscordWebhookMock).not.toHaveBeenCalled();

  webhook(WEBHOOK);
  await alertPriceSourceDegradation(PRICE_INFO);
  expect(postedEmbeds()).toEqual([
    {
      title: expect.any(String),
      description: expect.stringContaining('4/10 priced rows (40%)'),
      fields: [
        { name: 'Budget exhausted', value: 'yes', inline: true },
        { name: 'ESI / fallback', value: '6 / 4', inline: true },
      ],
      ...STAMP,
    },
  ]);
});

test('price degradation alert rejects a non-success response so bestEffort logs it', async () => {
  webhook(WEBHOOK, 503);

  await expect(alertPriceSourceDegradation(PRICE_INFO)).rejects.toThrow('returned 503');
});
