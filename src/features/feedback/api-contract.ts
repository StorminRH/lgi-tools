// API wire contract owned by the feedback feature (3.4.T).
import { z } from 'zod';
import type { ApiEndpoint } from '@/transport/api-client';
import { FEEDBACK_MESSAGE_MAX_LENGTH } from './constants';

/**
 * Sanity cap on the captured page URL. Real-world paths on this site stay
 * well under 200 chars; 512 leaves room for stacked filter params without
 * admitting outright abuse.
 */
export const FEEDBACK_PATH_MAX_LENGTH = 512;

/**
 * Bounded loose — the route's post-parse sanitiseUserText() trims and slices
 * to the real caps; the *4 multiplier here just rejects runaway 100KB bodies
 * before we spend cycles cleaning them up.
 */
export const feedbackRequestSchema = z.object({
  message: z.string().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH * 4),
  path: z.string().regex(/^\//, 'path must start with /').max(FEEDBACK_PATH_MAX_LENGTH * 4),
});

/**
 * Success is 204 No Content; errors are plain text (400/502/503) or the shared
 * RateLimitedBody 429 — there is no JSON success body to type.
 */
export const feedbackEndpoint: ApiEndpoint<z.input<typeof feedbackRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/feedback',
  request: feedbackRequestSchema,
  response: null,
};
