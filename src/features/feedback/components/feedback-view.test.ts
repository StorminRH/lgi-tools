import { describe, expect, it } from 'vitest';
import {
  problemBodySchema,
  type ProblemBody,
} from '@/lib/problem';
import {
  FEEDBACK_NETWORK_ERROR_MESSAGE,
  feedbackErrorMessage,
  feedbackSubmitGate,
} from './feedback-view';

describe('feedbackSubmitGate', () => {
  it('blocks busy, missing category, and empty message before allowing submit', () => {
    expect(feedbackSubmitGate('hi', 'bug', { kind: 'submitting' })).toBe('busy');
    expect(feedbackSubmitGate('hi', '', { kind: 'idle' })).toBe('no_category');
    expect(feedbackSubmitGate('hi', 'nope', { kind: 'idle' })).toBe('no_category');
    expect(feedbackSubmitGate('', 'bug', { kind: 'idle' })).toBe('empty');
    expect(feedbackSubmitGate('   ', 'feature', { kind: 'idle' })).toBe('empty');
    expect(feedbackSubmitGate('found a bug', 'bug', { kind: 'idle' })).toBe('ok');
    expect(
      feedbackSubmitGate('found a bug', 'ux', { kind: 'error', message: 'x' }),
    ).toBe('ok');
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
    error: problemBodySchema.parse({
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 400,
      code,
      correlationId: 'correlation-id',
      ...(detail === undefined ? {} : { detail }),
    }) as ProblemBody & { code: typeof code },
  });
  const problem429 = {
    ok: false as const,
    kind: 'api' as const,
    status: 429 as const,
    error: problemBodySchema.parse({
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 429,
      code: 'rate_limited' as const,
      correlationId: 'correlation-id',
    }) as ProblemBody & { code: 'rate_limited' },
  };
  const problem502 = {
    ok: false as const,
    kind: 'api' as const,
    status: 502 as const,
    error: problemBodySchema.parse({
      type: 'https://lgi.tools/problems/test',
      title: 'Test',
      status: 502,
      code: 'github_failed' as const,
      correlationId: 'correlation-id',
    }) as ProblemBody & { code: 'github_failed' },
  };

  it('maps validation, rate-limit, dependency, network, and protocol failures to user copy', () => {
    expect(
      feedbackErrorMessage(problem400('invalid_body', 'Message too long.')),
    ).toBe('Message too long.');
    expect(feedbackErrorMessage(problem400('invalid_body'))).toBe(
      'Please check your message and try again.',
    );
    expect(feedbackErrorMessage(problem429)).toBe(
      'Too much feedback too fast — please wait a minute and try again.',
    );
    expect(feedbackErrorMessage(problem502)).toBe(
      'Something went wrong sending your feedback. Try again.',
    );
    expect(
      feedbackErrorMessage({
        ok: false,
        kind: 'network',
        aborted: false,
        cause: new TypeError('failed'),
      }),
    ).toBe(FEEDBACK_NETWORK_ERROR_MESSAGE);
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
