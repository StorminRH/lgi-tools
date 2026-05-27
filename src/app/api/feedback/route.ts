import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/features/auth/session';
import { APP_VERSION } from '@/config/app-version';

// Discord's webhook content limit is 2000 chars; embed description is 4096.
// We cap at 2000 on input so a single feedback report always fits in one
// Discord message even if we ever move it from embed description to top-level
// `content`.
const MAX_MESSAGE_LENGTH = 2000;

// Sanity cap on the captured page URL. Real-world paths on this site stay
// well under 200 chars; 512 leaves room for stacked filter params without
// admitting outright abuse.
const MAX_PATH_LENGTH = 512;

const CONTROL_CHARS = /\p{C}/gu;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  if (!isRecord(body)) {
    return new Response('Body must be a JSON object', { status: 400 });
  }

  const { message: rawMessage, path: rawPath } = body;
  if (typeof rawMessage !== 'string') {
    return new Response('message must be a string', { status: 400 });
  }
  if (typeof rawPath !== 'string') {
    return new Response('path must be a string', { status: 400 });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH * 4) {
    // Reject runaway payloads early — the trim/cap below would clip them
    // silently, but a 100KB body is a misbehaving client, not a long
    // bug report.
    return new Response('message too large', { status: 400 });
  }
  if (rawPath.length > MAX_PATH_LENGTH * 4) {
    return new Response('path too large', { status: 400 });
  }

  const message = sanitiseText(rawMessage, MAX_MESSAGE_LENGTH);
  if (message.length === 0) {
    return new Response('message must not be empty', { status: 400 });
  }

  const path = sanitiseText(rawPath, MAX_PATH_LENGTH);
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
    discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
