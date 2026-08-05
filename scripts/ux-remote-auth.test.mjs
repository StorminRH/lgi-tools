import { describe, expect, it } from 'vitest';
import { vercelBypassHeaders } from './ux-remote-auth.mjs';

describe('vercelBypassHeaders', () => {
  it('returns undefined when no secret is provided', () => {
    expect(vercelBypassHeaders('')).toBeUndefined();
    expect(vercelBypassHeaders(undefined)).toBeUndefined();
  });

  it('sets the protection bypass and cookie headers', () => {
    expect(vercelBypassHeaders('test-secret')).toEqual({
      'x-vercel-protection-bypass': 'test-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });
});
