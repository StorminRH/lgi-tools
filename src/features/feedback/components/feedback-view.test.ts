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
  const problem400 = (
    code: 'invalid_json' | 'invalid_body' | 'title_empty' | 'message_empty' | 'path_invalid',
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
      code: 'linear_failed' as const,
      correlationId: 'correlation-id',
    }) as ProblemBody & { code: 'linear_failed' },
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
