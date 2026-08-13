import type { OutcomeOf } from '@/transport/endpoint';
import { feedbackEndpoint } from '../api-contract';
import { isFeedbackCategory } from '../categories';

/** Closed feedback submission state for idle, sending, success, and failure presentation. */
export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

/** Canonical user-facing copy for feedback submissions that fail at the network boundary. */
export const FEEDBACK_NETWORK_ERROR_MESSAGE =
  'Network error — your feedback did not send. Try again.';

/**
 * Whether a submit should proceed: `busy` while one is already in flight (silent
 * no-op), `empty` for a blank message, `no_category` when none is chosen, else `ok`.
 */
export function feedbackSubmitGate(
  message: string,
  category: string,
  state: SubmitState,
): 'busy' | 'empty' | 'no_category' | 'ok' {
  if (state.kind === 'submitting') return 'busy';
  if (!isFeedbackCategory(category)) return 'no_category';
  if (message.trim().length === 0) return 'empty';
  return 'ok';
}

/**
 * The user-facing error line for a failed typed submit outcome.
 */
export function feedbackErrorMessage(
  result: Exclude<OutcomeOf<typeof feedbackEndpoint>, { ok: true }>,
): string {
  if (result.kind === 'network') {
    return FEEDBACK_NETWORK_ERROR_MESSAGE;
  }
  if (result.kind === 'protocol') {
    return 'Something went wrong sending your feedback. Try again.';
  }
  if (result.status === 400) {
    return result.error.detail || 'Please check your message and try again.';
  }
  if (result.status === 429) {
    return 'Too much feedback too fast — please wait a minute and try again.';
  }
  return 'Something went wrong sending your feedback. Try again.';
}
