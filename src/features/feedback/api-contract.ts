import { z } from 'zod';
import {
  defineEndpoint,
  emptyBody,
  problem,
} from '@/transport/endpoint';
import { FEEDBACK_CATEGORIES } from './categories';
import { FEEDBACK_MESSAGE_MAX_LENGTH, FEEDBACK_TITLE_MAX_LENGTH } from './constants';

export const FEEDBACK_PATH_MAX_LENGTH = 512;

const feedbackCategorySchema = z.enum(
  FEEDBACK_CATEGORIES.map((entry) => entry.value) as [
    (typeof FEEDBACK_CATEGORIES)[number]['value'],
    ...(typeof FEEDBACK_CATEGORIES)[number]['value'][],
  ],
);

export const feedbackRequestSchema = z.object({
  title: z.string().min(1).max(FEEDBACK_TITLE_MAX_LENGTH * 4),
  message: z.string().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH * 4),
  path: z.string().max(FEEDBACK_PATH_MAX_LENGTH * 4),
  category: feedbackCategorySchema,
});

export const feedbackEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/feedback',
  request: feedbackRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem(
      'invalid_json',
      'invalid_body',
      'title_empty',
      'message_empty',
      'path_invalid',
    ),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
    502: problem('linear_failed'),
    503: problem('feedback_unconfigured'),
  },
});
