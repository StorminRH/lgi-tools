import { describe, expect, it } from 'vitest';
import { feedbackErrorMessage, feedbackSubmitGate } from './feedback-view';

describe('feedbackSubmitGate', () => {
  it('is busy while a submit is in flight', () => {
    expect(feedbackSubmitGate('hi', { kind: 'submitting' })).toBe('busy');
  });

  it('is empty for a blank or whitespace-only message', () => {
    expect(feedbackSubmitGate('', { kind: 'idle' })).toBe('empty');
    expect(feedbackSubmitGate('   ', { kind: 'idle' })).toBe('empty');
  });

  it('is ok for a real message when not already submitting', () => {
    expect(feedbackSubmitGate('found a bug', { kind: 'idle' })).toBe('ok');
    expect(feedbackSubmitGate('found a bug', { kind: 'error', message: 'x' })).toBe('ok');
  });
});

describe('feedbackErrorMessage', () => {
  const problem400 = (
    code: 'invalid_json' | 'invalid_body' | 'message_empty' | 'path_invalid',
    detail?: string,
  ) => ({
    ok: false as const,
    kind: 'api' as const,
    status: 400 as const,
    error: {
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 400,
      code,
      correlationId: 'correlation-id',
      ...(detail === undefined ? {} : { detail }),
    },
  });
  const problem429 = {
    ok: false as const,
    kind: 'api' as const,
    status: 429 as const,
    error: {
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 429,
      code: 'rate_limited' as const,
      correlationId: 'correlation-id',
    },
  };
  const problem502 = {
    ok: false as const,
    kind: 'api' as const,
    status: 502 as const,
    error: {
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 502,
      code: 'discord_failed' as const,
      correlationId: 'correlation-id',
    },
  };

  it('surfaces a 400 validation detail, or a fallback for an empty body', () => {
    expect(
      feedbackErrorMessage(problem400('invalid_body', 'Message too long.')),
    ).toBe('Message too long.');
    expect(feedbackErrorMessage(problem400('invalid_body'))).toBe(
      'Please check your message and try again.',
    );
  });

  it('gives a friendly line for rate-limit and server errors', () => {
    expect(feedbackErrorMessage(problem429)).toBe(
      'Too much feedback too fast — please wait a minute and try again.',
    );
    expect(feedbackErrorMessage(problem502)).toBe(
      'Something went wrong sending your feedback. Try again.',
    );
  });

  it('preserves the existing network copy and treats protocol drift as generic', () => {
    expect(
      feedbackErrorMessage({
        ok: false,
        kind: 'network',
        aborted: false,
        cause: new TypeError('failed'),
      }),
    ).toBe('Network error — your feedback did not send. Try again.');
    expect(
      feedbackErrorMessage({
        ok: false,
        kind: 'protocol',
        status: 418,
        detail: 'undeclared status',
      }),
    ).toBe('Something went wrong sending your feedback. Try again.');
  });
});
