import { describe, expect, it } from 'vitest';
import type { Session } from '@/features/auth/types';
import { runAsView } from './run-as-state';

const session: Session = {
  characterId: 90000001,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
  role: 'USER',
};

describe('runAsView', () => {
  it('reports loading while the session is still resolving', () => {
    expect(runAsView({ session: null, loading: true })).toEqual({ kind: 'loading' });
    // loading wins even if a session is somehow already in hand
    expect(runAsView({ session, loading: true })).toEqual({ kind: 'loading' });
  });

  it('reports anon for a settled, signed-out session', () => {
    expect(runAsView({ session: null, loading: false })).toEqual({ kind: 'anon' });
  });

  it('mirrors the active character when present', () => {
    expect(runAsView({ session, loading: false })).toEqual({
      kind: 'present',
      characterId: 90000001,
      name: 'Test Pilot',
      portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
    });
  });
});
