import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/features/auth/session';
import { APP_VERSION } from '@/config/app-version';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  FEEDBACK_PATH_MAX_LENGTH,
  feedbackRequestSchema,
} from '@/features/feedback/api-contract';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '@/features/feedback/constants';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { readEnv } from '@/lib/env';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/route-body';
import { sanitiseUserText } from '@/lib/sanitise';

// Per-IP rate limit. Feedback POSTs fan out to a Discord webhook, so an
// unthrottled endpoint is a webhook-spam vector. 5/min is generous for a
// real user typing thoughtfully but cuts a scripted flood off fast.
const FEEDBACK_LIMIT_PER_MINUTE = 5;

interface DiscordEmbed {
  title: string;
  description: string;
  author: { name: string };
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
}

function buildEmbed({
  message,
  path,
  authorName,
}: {
  message: string;
  path: string;
  authorName: string;
}): DiscordEmbed {
  return {
    title: 'New feedback',
    description: message,
    author: { name: authorName },
    fields: [{ name: 'Page', value: `\`${path}\``, inline: false }],
    footer: { text: `LGI.tools v${APP_VERSION}` },
    timestamp: new Date().toISOString(),
  };
}

// POST-only. Accepts JSON `{ message, path }`. Reads session server-side so
// character attribution can't be forged. Forwards to Discord webhook; on
// success, logs `feedback_submitted` to usage_logs (per the 2.8.4 audit
// pattern — one operational record, not a separate feedback table).
// Discord failure returns 502 and does NOT log telemetry; the action didn't
// happen.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, feedbackRequestSchema);
  if (!parsed.ok) return parsed.response;

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'feedback',
    perMinute: FEEDBACK_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  }

  const message = sanitiseUserText(parsed.data.message, FEEDBACK_MESSAGE_MAX_LENGTH);
  if (message.length === 0) {
    return new Response('message must not be empty', { status: 400 });
  }

  const path = sanitiseUserText(parsed.data.path, FEEDBACK_PATH_MAX_LENGTH);
  if (path.length === 0 || !path.startsWith('/')) {
    return new Response('path must start with /', { status: 400 });
  }

  const session = await getSession();
  const authorName = session
    ? `${session.name} (#${session.characterId})`
    : 'Anonymous';

  const webhookUrl = readEnv('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) {
    return new Response('Feedback channel is not configured', { status: 503 });
  }

  const embed = buildEmbed({ message, path, authorName });

  let discordResponse: Response;
  try {
    discordResponse = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': OUTBOUND_USER_AGENT,
      },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {
    return new Response('Could not reach Discord', { status: 502 });
  }

  if (!discordResponse.ok) {
    return new Response('Discord rejected the feedback', { status: 502 });
  }

  void logUsageEvent({
    action: 'feedback_submitted',
    characterId: session?.characterId ?? null,
    metadata: { messageLength: message.length, path },
  }).catch((err) => console.error('[feedback] telemetry write failed', err));

  return new Response(null, { status: 204 });
}
