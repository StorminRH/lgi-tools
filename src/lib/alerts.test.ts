import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postDiscordWebhookMock = vi.fn();

vi.mock('@/lib/discord', () => ({
  postDiscordWebhook: (...args: unknown[]) => postDiscordWebhookMock(...args),
}));

import { alertPriceSourceDegradation } from './alerts';

const INFO = { fetched: 10, esiCount: 6, fuzzworkFallbackCount: 4, budgetExhausted: true };

describe('alertPriceSourceDegradation', () => {
  beforeEach(() => {
    postDiscordWebhookMock.mockReset();
    postDiscordWebhookMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing when DISCORD_ALERT_WEBHOOK_URL is unset', async () => {
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', '');
    await alertPriceSourceDegradation(INFO);
    expect(postDiscordWebhookMock).not.toHaveBeenCalled();
  });

  it('posts an embed to the configured webhook', async () => {
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', 'https://discord.test/webhook');
    await alertPriceSourceDegradation(INFO);
    expect(postDiscordWebhookMock).toHaveBeenCalledTimes(1);
    const [url, payload] = postDiscordWebhookMock.mock.calls[0] as [string, { embeds: unknown[] }];
    expect(url).toBe('https://discord.test/webhook');
    expect(Array.isArray(payload.embeds)).toBe(true);
  });
});
