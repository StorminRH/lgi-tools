import { describe, expect, it } from 'vitest';
import {
  acceptReply,
  failRequest,
  initialKernelRequestState,
  postRequest,
} from './kernel-requests';

describe('kernel request sequencing', () => {
  it('posts a monotonic request id and advances the posted key', () => {
    const first = postRequest(initialKernelRequestState(), 'sig#0');
    expect(first.kind).toBe('posted');
    if (first.kind !== 'posted') return;
    expect(first.requestId).toBe(1);
    expect(first.state.postedKey).toBe('sig#0');
    expect(first.state.latestPostedId).toBe(1);

    const second = postRequest(first.state, 'sig#1');
    expect(second.kind).toBe('posted');
    if (second.kind !== 'posted') return;
    expect(second.requestId).toBe(2);
    expect(second.state.latestPostedId).toBe(2);
  });

  it('never reposts when the posted key is unchanged', () => {
    const first = postRequest(initialKernelRequestState(), 'sig#0');
    if (first.kind !== 'posted') throw new Error('expected post');
    const skipped = postRequest(first.state, 'sig#0');
    expect(skipped.kind).toBe('skipped');
    expect(skipped.state).toEqual(first.state);
  });

  it('accepts only the latest posted request id', () => {
    let state = initialKernelRequestState();
    const first = postRequest(state, 'a');
    if (first.kind !== 'posted') throw new Error('expected post');
    state = first.state;
    const second = postRequest(state, 'b');
    if (second.kind !== 'posted') throw new Error('expected post');
    state = second.state;

    expect(acceptReply(state, first.requestId)).toBe(false);
    expect(acceptReply(state, second.requestId)).toBe(true);
  });

  it('resets the posted key on a terminal-without-apply failure of the latest id', () => {
    const posted = postRequest(initialKernelRequestState(), 'sig#0');
    if (posted.kind !== 'posted') throw new Error('expected post');
    const failed = failRequest(posted.state, posted.requestId);
    expect(failed.postedKey).toBeNull();
    expect(failed.latestPostedId).toBe(posted.requestId);

    // The next change with the same key can retry.
    const retry = postRequest(failed, 'sig#0');
    expect(retry.kind).toBe('posted');
  });

  it('leaves sequencing alone when a superseded request fails', () => {
    let state = initialKernelRequestState();
    const first = postRequest(state, 'a');
    if (first.kind !== 'posted') throw new Error('expected post');
    const second = postRequest(first.state, 'b');
    if (second.kind !== 'posted') throw new Error('expected post');
    state = failRequest(second.state, first.requestId);
    expect(state.postedKey).toBe('b');
    expect(state.latestPostedId).toBe(second.requestId);
  });

});
