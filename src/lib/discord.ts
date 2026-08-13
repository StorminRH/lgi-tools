import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * Thin POST to a Discord webhook URL, carrying our outbound identity and the
 * shared fetch timeout. Returns the raw Response so each caller decides how to
 * treat a non-2xx — ops alerts currently swallow failures.
 */
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
