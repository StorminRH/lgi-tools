import { describe, expect, it } from 'vitest';
import type { Session } from '@/features/auth/types';
import { resolveBuildCharacter, runAsView, type BuildCharacter } from './run-as-state';

const session: Session = {
  characterId: 90000001,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=128',
  role: 'USER',
};

const alt: BuildCharacter = {
  characterId: 90000002,
  name: 'Alt Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000002/portrait?size=128',
  needsReconnect: false,
};

const brokenAlt: BuildCharacter = { ...alt, characterId: 90000003, needsReconnect: true };

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

  it('renders the selected build character over the active mirror', () => {
    expect(runAsView({ session, loading: false }, { character: alt, pending: false })).toEqual({
      kind: 'present',
      characterId: 90000002,
      name: 'Alt Pilot',
      portraitUrl: 'https://images.evetech.net/characters/90000002/portrait?size=128',
    });
  });

  it('reads loading while a stored selection awaits the roster (never the wrong portrait)', () => {
    expect(runAsView({ session, loading: false }, { character: null, pending: true })).toEqual({
      kind: 'loading',
    });
  });

  it('mirrors the active character when the selection is unset — identical to no selection arg', () => {
    expect(runAsView({ session, loading: false }, { character: null, pending: false })).toEqual(
      runAsView({ session, loading: false }),
    );
  });

  it('stays anon regardless of a lingering selection', () => {
    expect(runAsView({ session: null, loading: false }, { character: alt, pending: false })).toEqual(
      { kind: 'anon' },
    );
  });

  it('lets session loading win over a resolved selection', () => {
    expect(runAsView({ session, loading: true }, { character: alt, pending: false })).toEqual({
      kind: 'loading',
    });
  });
});

describe('resolveBuildCharacter', () => {
  const roster = [alt, brokenAlt];

  it('resolves unset to the mirror without waiting on the roster', () => {
    expect(resolveBuildCharacter(null, null)).toEqual({ character: null, pending: false });
    expect(resolveBuildCharacter(null, roster)).toEqual({ character: null, pending: false });
  });

  it('is pending while a stored id awaits the roster', () => {
    expect(resolveBuildCharacter(90000002, null)).toEqual({ character: null, pending: true });
  });

  it('resolves a stored id found on the roster', () => {
    expect(resolveBuildCharacter(90000002, roster)).toEqual({ character: alt, pending: false });
  });

  it('fails open to the mirror when the settled roster no longer has the id', () => {
    expect(resolveBuildCharacter(90000009, roster)).toEqual({ character: null, pending: false });
    expect(resolveBuildCharacter(90000009, [])).toEqual({ character: null, pending: false });
  });

  it('still resolves a needsReconnect character — scope health never gates selection', () => {
    expect(resolveBuildCharacter(90000003, roster)).toEqual({
      character: brokenAlt,
      pending: false,
    });
  });
});
