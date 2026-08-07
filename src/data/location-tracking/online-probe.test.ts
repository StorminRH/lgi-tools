import { describe, expect, it } from 'vitest';
import { decideOnlineProbe } from './online-probe';

const NOW = 1_750_000_000_000;

describe('decideOnlineProbe', () => {
  it('reuses a held answer inside its cache window — zero ESI', () => {
    expect(
      decideOnlineProbe({ online: true, etagOnline: 'e1', onlineExpiresAt: NOW + 1 }, NOW),
    ).toEqual({ kind: 'held', online: true });
    expect(
      decideOnlineProbe({ online: false, etagOnline: null, onlineExpiresAt: NOW + 60_000 }, NOW),
    ).toEqual({ kind: 'held', online: false });
  });

  it('re-reads conditionally at and past the window edge, echoing the held ETag', () => {
    expect(
      decideOnlineProbe({ online: true, etagOnline: 'e1', onlineExpiresAt: NOW }, NOW),
    ).toEqual({ kind: 'read', etagOnline: 'e1' });
  });

  it('a never-probed character reads unconditionally', () => {
    expect(decideOnlineProbe(undefined, NOW)).toEqual({ kind: 'read', etagOnline: null });
  });
});
