import { failureMessage, type FailedOutcome, type FailureCopy } from '@/transport/failure-copy';
import { feedbackEndpoint } from '../api-contract';
import { isFeedbackCategory } from '../categories';

export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string; field?: 'title' | 'message' };

export const FEEDBACK_NETWORK_ERROR_MESSAGE =
  "Couldn't send your feedback. Check your connection and try again.";

export function feedbackSubmitGate(
  title: string,
  message: string,
  category: string,
  state: SubmitState,
): 'busy' | 'empty_title' | 'empty' | 'no_category' | 'ok' {
  if (state.kind === 'submitting') return 'busy';
  if (!isFeedbackCategory(category)) return 'no_category';
  if (title.trim().length === 0) return 'empty_title';
  if (message.trim().length === 0) return 'empty';
  return 'ok';
}

const FEEDBACK_FAILURE_COPY = {
  fallback: "Couldn't send your feedback. Try again.",
  network: FEEDBACK_NETWORK_ERROR_MESSAGE,
  codes: {
    linear_failed: "Couldn't send your feedback. Try again in a few minutes.",
    feedback_unconfigured: 'Feedback is unavailable right now.',
  },
} satisfies FailureCopy<FailedOutcome<typeof feedbackEndpoint>>;

/** User copy for a failed send, by the server's code; the server's own detail is developer text and stays out. */
export function feedbackErrorMessage(result: FailedOutcome<typeof feedbackEndpoint>): string {
  return failureMessage(result, FEEDBACK_FAILURE_COPY);
}
