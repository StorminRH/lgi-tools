// API wire contract owned by the feedback feature (3.4.T).
import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  problem,
} from '@/transport/endpoint';
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
  path: z
    .string()
    .regex(/^\//, 'path must start with /')
    .max(FEEDBACK_PATH_MAX_LENGTH * 4),
});

/** Complete request and per-status response contract for feedback submission. */
export const feedbackEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/feedback',
  request: feedbackRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body', 'message_empty', 'path_invalid'),
    429: problem('rate_limited'),
    502: problem('discord_failed'),
    503: problem('feedback_unconfigured'),
  },
});
