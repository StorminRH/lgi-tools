import { describe, expect, it } from 'vitest';
import { parseServerStatus } from './parse';

describe('parseServerStatus', () => {
  it('maps a normal status body to online with the player count', () => {
    expect(
      parseServerStatus({
        players: 13459,
        server_version: '3405148',
        start_time: '2026-06-23T11:03:21Z',
      }),
    ).toEqual({ state: 'online', players: 13459 });
  });

  it('maps vip:true to the vip state', () => {
    expect(parseServerStatus({ players: 42, vip: true })).toEqual({
      state: 'vip',
      players: 42,
    });
  });

  it('treats vip:false the same as an absent flag (online)', () => {
    expect(parseServerStatus({ players: 13459, vip: false })).toEqual({
      state: 'online',
      players: 13459,
    });
  });

  it('throws on a malformed or missing body', () => {
    expect(() => parseServerStatus({ players: 'lots' })).toThrow();
    expect(() => parseServerStatus({})).toThrow();
    expect(() => parseServerStatus(null)).toThrow();
  });
});
