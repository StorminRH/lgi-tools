import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/platform/auth/session';
import { requireSameOrigin } from '@/platform/auth/same-origin';
import { APP_VERSION } from '@/config/app-version';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  FEEDBACK_PATH_MAX_LENGTH,
  feedbackEndpoint,
  feedbackRequestSchema,
} from '@/features/feedback/api-contract';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from '@/features/feedback/constants';
import {
  dependencyUnavailableFailure,
  validationFailure,
} from '@/lib/failure';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { readEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitiseUserText } from '@/lib/sanitise';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

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

/**
 * POST-only. Accepts JSON `{ message, path }`. Reads session server-side so
 * character attribution can't be forged. Forwards to Discord webhook; on
 * success, logs `feedback_submitted` to usage_logs (per the 2.8.4 audit
 * pattern — one operational record, not a separate feedback table).
 * Discord failure returns 502 and does NOT log telemetry; the action didn't
 * happen.
 */
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, feedbackRequestSchema);
  if (!parsed.ok) return apiResponse(feedbackEndpoint, 400, parsed.failure);

  const limit = await checkRateLimit(request, {
    name: 'feedback',
    perMinute: FEEDBACK_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return apiResponse(feedbackEndpoint, 429, limit.failure);

  const message = sanitiseUserText(parsed.data.message, FEEDBACK_MESSAGE_MAX_LENGTH);
  if (message.length === 0) {
    return apiResponse(
      feedbackEndpoint,
      400,
      validationFailure('message_empty', 'message must not be empty'),
    );
  }

  const path = sanitiseUserText(parsed.data.path, FEEDBACK_PATH_MAX_LENGTH);
  if (path.length === 0 || !path.startsWith('/')) {
    return apiResponse(
      feedbackEndpoint,
      400,
      validationFailure('path_invalid', 'path must start with /'),
    );
  }

  const originCheck = requireSameOrigin(request);
  if (!originCheck.ok) {
    return apiResponse(feedbackEndpoint, 403, originCheck.failure);
  }

  const session = await getSession();
  const authorName = session
    ? `${session.name} (#${session.characterId})`
    : 'Anonymous';

  const webhookUrl = readEnv('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) {
    return apiResponse(
      feedbackEndpoint,
      503,
      dependencyUnavailableFailure(
        'feedback_unconfigured',
        503,
        { detail: 'Feedback channel is not configured' },
      ),
    );
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
  } catch (cause) {
    return apiResponse(
      feedbackEndpoint,
      502,
      dependencyUnavailableFailure(
        'discord_failed',
        502,
        { cause, detail: 'Could not reach Discord' },
      ),
    );
  }

  if (!discordResponse.ok) {
    return apiResponse(
      feedbackEndpoint,
      502,
      dependencyUnavailableFailure(
        'discord_failed',
        502,
        { detail: 'Discord rejected the feedback' },
      ),
    );
  }

  void logUsageEvent({
    action: 'feedback_submitted',
    characterId: session?.characterId ?? null,
    metadata: { messageLength: message.length, path },
  }).catch((err) => console.error('[feedback] telemetry write failed', err));

  return apiResponse(feedbackEndpoint, 204);
}
