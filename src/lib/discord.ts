import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export async function postDiscordWebhook(
  url: string,
  payload: unknown,
): Promise<Response> {
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': OUTBOUND_USER_AGENT,
    },
    body: JSON.stringify(payload),
  });
}
