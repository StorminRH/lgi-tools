// API wire contract owned by the contact feature (3.4.T).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { CONTACT_MESSAGE_MAX_LENGTH } from './constants';

// RFC 5321 caps an email address at 254 chars.
const MAX_EMAIL_LENGTH = 254;

// `website` is a honeypot: hidden from real users, irresistible to bots. A
// non-empty value means a bot — the route accepts (204) without sending so the
// trap stays unrevealed. The *4 multiplier on message rejects runaway bodies
// before we spend cycles cleaning them; sanitiseUserText() enforces the real cap.
export const contactRequestSchema = z.object({
  email: z.email().max(MAX_EMAIL_LENGTH),
  message: z.string().min(1).max(CONTACT_MESSAGE_MAX_LENGTH * 4),
  website: z.string().max(200).optional(),
});

// Success is 204 No Content; errors are plain text (400/502/503) or the shared
// RateLimitedBody 429 — there is no JSON success body to type.
export const contactEndpoint: ApiEndpoint<z.input<typeof contactRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/contact',
  request: contactRequestSchema,
  response: null,
};
