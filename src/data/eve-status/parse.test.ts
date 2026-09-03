import { describe, expect, it } from 'vitest';
import { parseServerStatus } from './parse';

describe('parseServerStatus', () => {
  it('maps online, vip, and malformed bodies', () => {
    expect(
      parseServerStatus({
        players: 13459,
        server_version: '3405148',
        start_time: '2026-06-23T11:03:21Z',
      }),
    ).toEqual({ state: 'online', players: 13459 });
    expect(parseServerStatus({ players: 42, vip: true })).toEqual({
      state: 'vip',
      players: 42,
    });
    expect(parseServerStatus({ players: 13459, vip: false })).toEqual({
      state: 'online',
      players: 13459,
    });
    expect(() => parseServerStatus({ players: 'lots' })).toThrow();
    expect(() => parseServerStatus({})).toThrow();
    expect(() => parseServerStatus(null)).toThrow();
  });
});
