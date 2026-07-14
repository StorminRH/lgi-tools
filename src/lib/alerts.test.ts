import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postDiscordWebhookMock = vi.fn();

vi.mock('@/lib/discord', () => ({
  postDiscordWebhook: (...args: unknown[]) => postDiscordWebhookMock(...args),
}));

import {
  alertPriceSourceDegradation,
  alertPublicEsiBudgetExhaustion,
  isOpsAlertConfigured,
} from './alerts';

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

describe('alertPublicEsiBudgetExhaustion', () => {
  beforeEach(() => {
    postDiscordWebhookMock.mockReset();
    postDiscordWebhookMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports whether an alert was actually posted', async () => {
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', '');
    expect(isOpsAlertConfigured()).toBe(false);
    await expect(alertPublicEsiBudgetExhaustion({ count: 3, windowMinutes: 15 })).resolves.toBe(false);
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', 'https://discord.test/webhook');
    expect(isOpsAlertConfigured()).toBe(true);
    await expect(alertPublicEsiBudgetExhaustion({ count: 3, windowMinutes: 15 })).resolves.toBe(true);
    expect(postDiscordWebhookMock).toHaveBeenCalledOnce();
  });

  it('rejects a non-success response so the alert claim can be released', async () => {
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', 'https://discord.test/webhook');
    postDiscordWebhookMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      alertPublicEsiBudgetExhaustion({ count: 3, windowMinutes: 15 }),
    ).rejects.toThrow('returned 503');
  });
});
