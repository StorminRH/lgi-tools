export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

// Whether a submit should proceed: `busy` while one is already in flight (silent
// no-op), `empty` for a blank message (show the inline error), else `ok`.
export function feedbackSubmitGate(message: string, state: SubmitState): 'busy' | 'empty' | 'ok' {
  if (state.kind === 'submitting') return 'busy';
  if (message.trim().length === 0) return 'empty';
  return 'ok';
}

// The user-facing error line for a failed submit, gated on status so a raw error
// body never reaches the UI: 400 carries a human-readable validation detail;
// 429 / 5xx get a friendly line each.
export async function feedbackErrorMessage(result: {
  status: number;
  response: Response;
}): Promise<string> {
  if (result.status === 400) {
    return (await result.response.text()) || 'Please check your message and try again.';
  }
  if (result.status === 429) {
    return 'Too much feedback too fast — please wait a minute and try again.';
  }
  return 'Something went wrong sending your feedback. Try again.';
}
