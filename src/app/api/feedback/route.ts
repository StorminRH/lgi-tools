import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/features/auth/session';
import { APP_VERSION } from '@/config/app-version';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { clientIdentifier, rateLimit } from '@/lib/rate-limit';

// Discord's webhook content limit is 2000 chars; embed description is 4096.
// We cap at 2000 on input so a single feedback report always fits in one
// Discord message even if we ever move it from embed description to top-level
// `content`.
const MAX_MESSAGE_LENGTH = 2000;

// Sanity cap on the captured page URL. Real-world paths on this site stay
// well under 200 chars; 512 leaves room for stacked filter params without
// admitting outright abuse.
const MAX_PATH_LENGTH = 512;

// Per-IP rate limit. Feedback POSTs fan out to a Discord webhook, so an
// unthrottled endpoint is a webhook-spam vector. 5/min is generous for a
// real user typing thoughtfully but cuts a scripted flood off fast.
const FEEDBACK_LIMIT_PER_MINUTE = 5;

const CONTROL_CHARS = /\p{C}/gu;

// Bounded loose — the post-parse sanitiseText() trims and slices to the real
// caps below; the *4 multiplier here just rejects runaway 100KB bodies before
// we spend cycles cleaning them up. Same intent as the pre-Zod check.
const feedbackSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH * 4),
  path: z.string().regex(/^\//, 'path must start with /').max(MAX_PATH_LENGTH * 4),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function sanitiseText(raw: string, max: number): string {
  return raw.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

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
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue ? `${firstIssue.path.join('.') || 'body'}: ${firstIssue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'feedback',
    perMinute: FEEDBACK_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  }

  const message = sanitiseText(parsed.data.message, MAX_MESSAGE_LENGTH);
  if (message.length === 0) {
    return new Response('message must not be empty', { status: 400 });
  }

  const path = sanitiseText(parsed.data.path, MAX_PATH_LENGTH);
  if (path.length === 0 || !path.startsWith('/')) {
    return new Response('path must start with /', { status: 400 });
  }

  const session = await getSession();
  const authorName = session
    ? `${session.name} (#${session.characterId})`
    : 'Anonymous';

  let webhookUrl: string;
  try {
    webhookUrl = requireEnv('DISCORD_WEBHOOK_URL');
  } catch {
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
