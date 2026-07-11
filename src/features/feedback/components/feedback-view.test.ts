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
  const resultWith = (status: number, body: string) =>
    ({ status, response: { text: () => Promise.resolve(body) } as unknown as Response });

  it('surfaces a 400 validation detail, or a fallback for an empty body', async () => {
    expect(await feedbackErrorMessage(resultWith(400, 'Message too long.'))).toBe('Message too long.');
    expect(await feedbackErrorMessage(resultWith(400, ''))).toBe(
      'Please check your message and try again.',
    );
  });

  it('gives a friendly line for rate-limit and server errors', async () => {
    expect(await feedbackErrorMessage(resultWith(429, ''))).toBe(
      'Too much feedback too fast — please wait a minute and try again.',
    );
    expect(await feedbackErrorMessage(resultWith(500, ''))).toBe(
      'Something went wrong sending your feedback. Try again.',
    );
  });
});
