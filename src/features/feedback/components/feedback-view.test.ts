import { describe, expect, it } from 'vitest';
import { apiProblem, networkDown, protocolFailure } from '@/transport/__tests__/failed-outcomes';
import {
  FEEDBACK_NETWORK_ERROR_MESSAGE,
  feedbackErrorMessage,
  feedbackSubmitGate,
} from './feedback-view';

describe('feedbackSubmitGate', () => {
  it('blocks busy, missing category, and empty title or message before allowing submit', () => {
    expect(feedbackSubmitGate('title', 'hi', 'bug', { kind: 'submitting' })).toBe('busy');
    expect(feedbackSubmitGate('title', 'hi', '', { kind: 'idle' })).toBe('no_category');
    expect(feedbackSubmitGate('title', 'hi', 'nope', { kind: 'idle' })).toBe('no_category');
    expect(feedbackSubmitGate('', 'hi', 'bug', { kind: 'idle' })).toBe('empty_title');
    expect(feedbackSubmitGate('   ', 'hi', 'bug', { kind: 'idle' })).toBe('empty_title');
    expect(feedbackSubmitGate('title', '', 'bug', { kind: 'idle' })).toBe('empty');
    expect(feedbackSubmitGate('title', '   ', 'feature', { kind: 'idle' })).toBe('empty');
    expect(feedbackSubmitGate('sites filter', 'found a bug', 'bug', { kind: 'idle' })).toBe(
      'ok',
    );
    expect(
      feedbackSubmitGate('sites filter', 'found a bug', 'ux', { kind: 'error', message: 'x' }),
    ).toBe('ok');
  });
});

describe('feedbackErrorMessage', () => {
  it('maps each refusal code to user copy and never shows the server detail', () => {
    // The server's detail is developer text; the reader sees copy for the code.
    // The form blocks an empty title or message and sends its own path, so those refusals take the plain line.
    for (const code of ['title_empty', 'message_empty', 'path_invalid'] as const) {
      expect(feedbackErrorMessage(apiProblem(400, code, { detail: `${code} detail` }))).toBe(
        "Couldn't send your feedback. Try again.",
      );
    }
    expect(feedbackErrorMessage(apiProblem(400, 'invalid_body', { detail: 'Too big: expected string to have <=8000 characters' }))).toBe(
      "Couldn't send your feedback. Try again.",
    );
    expect(feedbackErrorMessage(apiProblem(502, 'linear_failed'))).toBe(
      "Couldn't send your feedback. Try again in a few minutes.",
    );
    expect(feedbackErrorMessage(apiProblem(503, 'feedback_unconfigured'))).toBe('Feedback is unavailable right now.');
  });

  it('reads the wait from the rate limit and keeps its own network and fallback copy', () => {
    expect(feedbackErrorMessage(apiProblem(429, 'rate_limited', { retryAfterSeconds: 60 }))).toBe(
      'Too many attempts. Try again in 60 seconds.',
    );
    expect(feedbackErrorMessage(networkDown())).toBe(FEEDBACK_NETWORK_ERROR_MESSAGE);
    expect(FEEDBACK_NETWORK_ERROR_MESSAGE).toBe("Couldn't send your feedback. Check your connection and try again.");
    expect(feedbackErrorMessage(apiProblem(403, 'cross_origin'))).toBe("Couldn't send your feedback. Try again.");
    expect(feedbackErrorMessage(protocolFailure(418))).toBe("Couldn't send your feedback. Try again.");
  });
});
