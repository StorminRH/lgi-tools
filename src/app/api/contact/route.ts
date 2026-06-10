import type { NextRequest } from 'next/server';
import { APP_VERSION } from '@/config/app-version';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/features/auth/session';
import { contactRequestSchema } from '@/features/contact/api-contract';
import { CONTACT_MESSAGE_MAX_LENGTH } from '@/features/contact/constants';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';
import { sanitiseUserText } from '@/lib/sanitise';

// Per-IP rate limit. Each accepted submission sends an email, so an
// unthrottled endpoint is a mail-spam vector. 3/min is plenty for a human
// writing a real message and cuts a scripted flood off fast.
const CONTACT_LIMIT_PER_MINUTE = 3;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resend's shared sender works without a verified domain (test mode delivers
// only to the Resend account's own address). Once the lgi.tools domain is
// verified in Resend, set CONTACT_FROM_EMAIL to a `Name <addr@lgi.tools>`.
const DEFAULT_FROM = 'LGI.tools Contact <onboarding@resend.dev>';

// POST-only. Accepts JSON `{ email, message, website? }`. Sends the message to
// the maintainer's inbox (CONTACT_EMAIL — server-side only, never shipped to
// the client) via Resend, with the visitor's address as Reply-To. Reads the
// session server-side purely to attach in-game character context when the
// sender happens to be logged in. On success, logs `contact_submitted`
// (message length + attribution only — never the address or body). Mail
// failure returns 502 and skips telemetry; the action didn't happen.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = contactRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join('.') || 'body'}: ${firstIssue.message}`
      : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  // Honeypot tripped — accept silently without sending so the trap isn't
  // revealed to the bot that fell into it.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return new Response(null, { status: 204 });
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'contact',
    perMinute: CONTACT_LIMIT_PER_MINUTE,
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

  const message = sanitiseUserText(parsed.data.message, CONTACT_MESSAGE_MAX_LENGTH);
  if (message.length === 0) {
    return new Response('message must not be empty', { status: 400 });
  }
  const email = parsed.data.email.trim();

  const apiKey = readEnv('RESEND_API_KEY');
  const to = readEnv('CONTACT_EMAIL');
  if (!apiKey || !to) {
    return new Response('Contact form is not configured', { status: 503 });
  }
  const from = readEnv('CONTACT_FROM_EMAIL') ?? DEFAULT_FROM;

  const session = await getSession();
  const sender = session
    ? `${email} (in-game: ${session.name} #${session.characterId})`
    : email;

  let mailResponse: Response;
  try {
    mailResponse = await fetchWithTimeout(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': OUTBOUND_USER_AGENT,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `LGI.tools contact — ${session ? session.name : email}`,
        text: `From: ${sender}\n\n${message}\n\n— sent via the LGI.tools v${APP_VERSION} contact form`,
      }),
    });
  } catch {
    return new Response('Could not reach the mail service', { status: 502 });
  }

  if (!mailResponse.ok) {
    return new Response('Mail service rejected the message', { status: 502 });
  }

  void logUsageEvent({
    action: 'contact_submitted',
    characterId: session?.characterId ?? null,
    metadata: { messageLength: message.length },
  }).catch((err) => console.error('[contact] telemetry write failed', err));

  return new Response(null, { status: 204 });
}
