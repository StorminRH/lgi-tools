import { beforeEach, describe, expect, it, vi } from 'vitest';

const oauthState = vi.hoisted(() => ({ value: null as unknown, error: null as Error | null }));

vi.mock('better-auth/api', () => ({
  getOAuthState: async () => {
    if (oauthState.error) throw oauthState.error;
    return oauthState.value;
  },
}));

import { readLinkingUserId, rebindLinkTarget } from './link-intent';

beforeEach(() => {
  oauthState.value = null;
  oauthState.error = null;
});

describe('readLinkingUserId', () => {
  it('returns the link target of a link callback and null for sign-in or outside a request', async () => {
    oauthState.value = { callbackURL: '/', link: { userId: 'user-b', email: 'b@eve.invalid' } };
    await expect(readLinkingUserId()).resolves.toBe('user-b');
    oauthState.value = { callbackURL: '/' };
    await expect(readLinkingUserId()).resolves.toBeNull();
    oauthState.error = new Error('No request state found.');
    await expect(readLinkingUserId()).resolves.toBeNull();
  });
});

describe('rebindLinkTarget', () => {
  it('rewrites link.userId on the live state object and refuses outside a link callback', async () => {
    const state = { callbackURL: '/', link: { userId: 'user-b', email: 'b@eve.invalid' } };
    oauthState.value = state;
    await rebindLinkTarget('user-a');
    expect(state.link).toEqual({ userId: 'user-a', email: 'b@eve.invalid' });
    oauthState.value = { callbackURL: '/' };
    await expect(rebindLinkTarget('user-a')).rejects.toThrow('outside a link callback');
  });
});
