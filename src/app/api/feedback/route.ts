import type { NextRequest } from 'next/server';
import { allowAnonymous, runMutationRoute } from '@/app/api/mutation-route';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSession } from '@/composition/session';
import { APP_VERSION } from '@/config/app-version';
import {
  FEEDBACK_PATH_MAX_LENGTH,
  feedbackEndpoint,
  feedbackRequestSchema,
} from '@/features/feedback/api-contract';
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
} from '@/features/feedback/constants';
import { createFeedbackLinearIssue } from '@/features/feedback/create-linear-issue';
import {
  dependencyUnavailableFailure,
  validationFailure,
} from '@/lib/failure';
import { readEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitiseUserText } from '@/lib/sanitise';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const FEEDBACK_LIMIT_PER_MINUTE = 5;

// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'feedback.submit-feedback',
    endpoint: feedbackEndpoint,
    authorize: allowAnonymous,
    parse: (incoming) => readJsonBody(incoming, feedbackRequestSchema),
    handle: async (_authorization, body) => {
      const limit = await checkRateLimit(request, {
        name: 'feedback',
        perMinute: FEEDBACK_LIMIT_PER_MINUTE,
      });
      if (!limit.ok) return apiResponse(feedbackEndpoint, 429, limit.failure);

      const title = sanitiseUserText(body.title, FEEDBACK_TITLE_MAX_LENGTH);
      if (title.length === 0) {
        return apiResponse(
          feedbackEndpoint,
          400,
          validationFailure('title_empty', 'title must not be empty'),
        );
      }

      const message = sanitiseUserText(body.message, FEEDBACK_MESSAGE_MAX_LENGTH);
      if (message.length === 0) {
        return apiResponse(
          feedbackEndpoint,
          400,
          validationFailure('message_empty', 'message must not be empty'),
        );
      }

      const path = sanitiseUserText(body.path, FEEDBACK_PATH_MAX_LENGTH);
      if (path.length === 0 || !path.startsWith('/')) {
        return apiResponse(
          feedbackEndpoint,
          400,
          validationFailure('path_invalid', 'path must start with /'),
        );
      }

      const session = await getSession();
      const authorName = session ? session.name : 'Anonymous';
      const category = body.category;

      if (!readEnv('LINEAR_API_KEY')) {
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

      let linearResponse: Response;
      try {
        linearResponse = await createFeedbackLinearIssue({
          title,
          message,
          path,
          category,
          authorName,
          appVersion: APP_VERSION,
        });
      } catch (cause) {
        return apiResponse(
          feedbackEndpoint,
          502,
          dependencyUnavailableFailure(
            'linear_failed',
            502,
            { cause, detail: 'Could not reach Linear' },
          ),
        );
      }

      if (!linearResponse.ok) {
        return apiResponse(
          feedbackEndpoint,
          502,
          dependencyUnavailableFailure(
            'linear_failed',
            502,
            { detail: 'Linear rejected the feedback' },
          ),
        );
      }

      void logUsageEvent({
        action: 'feedback_submitted',
        characterId: session?.characterId ?? null,
        metadata: {
          titleLength: title.length,
          messageLength: message.length,
          path,
          category,
        },
      }).catch((err) => console.error('[feedback] telemetry write failed', err));

      return apiResponse(feedbackEndpoint, 204);
    },
  });
}
