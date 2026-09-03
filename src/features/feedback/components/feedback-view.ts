import type { OutcomeOf } from '@/transport/endpoint';
import { feedbackEndpoint } from '../api-contract';
import { isFeedbackCategory } from '../categories';

export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string; field?: 'title' | 'message' };

export const FEEDBACK_NETWORK_ERROR_MESSAGE =
  'Network error — your feedback did not send. Try again.';

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
