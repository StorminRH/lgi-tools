import type { OutcomeOf } from '@/transport/endpoint';
import { feedbackEndpoint } from '../api-contract';

/** Closed feedback submission state for idle, sending, success, and failure presentation. */
export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

/**
 * Whether a submit should proceed: `busy` while one is already in flight (silent
 * no-op), `empty` for a blank message (show the inline error), else `ok`.
 */
export function feedbackSubmitGate(message: string, state: SubmitState): 'busy' | 'empty' | 'ok' {
  if (state.kind === 'submitting') return 'busy';
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
    return 'Network error — your feedback did not send. Try again.';
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
