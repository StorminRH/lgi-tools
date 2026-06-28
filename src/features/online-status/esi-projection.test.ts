import { describe, expect, it } from 'vitest';
import { parseOnlineBody } from './esi-projection';

describe('parseOnlineBody', () => {
  it('reads online:true from a full ESI body (extras stripped)', () => {
    expect(
      parseOnlineBody({
        online: true,
        last_login: '2026-06-28T10:00:00Z',
        last_logout: '2026-06-27T10:00:00Z',
        logins: 42,
      }),
    ).toBe(true);
  });

  it('reads online:false', () => {
    expect(parseOnlineBody({ online: false })).toBe(false);
  });

  it('returns null when online is absent', () => {
    expect(parseOnlineBody({ last_login: 'x' })).toBe(null);
  });

  it('returns null on a non-boolean online', () => {
    expect(parseOnlineBody({ online: 'yes' })).toBe(null);
    expect(parseOnlineBody({ online: 1 })).toBe(null);
  });

  it('returns null on a non-object body', () => {
    expect(parseOnlineBody(null)).toBe(null);
    expect(parseOnlineBody('online')).toBe(null);
    expect(parseOnlineBody([])).toBe(null);
  });
});
