import { describe, expect, it, vi } from 'vitest';
import { deriveSessionIdentity } from './session-identity';
import type { ActiveCharacter } from './queries';

const baseUser = { id: 'u1', role: 'USER', name: 'User Name', image: 'user-image.png' };
const baseSession = { id: 's1' };
const notAdmin = () => false;

describe('deriveSessionIdentity', () => {
  it('derives identity from the active character when present', () => {
    const active: ActiveCharacter = { characterId: 42, name: 'Pilot', portraitUrl: 'pilot.png' };
    const out = deriveSessionIdentity({ user: baseUser, session: baseSession, active, isAdmin: notAdmin });
    expect(out.characterId).toBe(42);
    expect(out.name).toBe('Pilot');
    expect(out.portraitUrl).toBe('pilot.png');
  });

  it('falls back to the user row when there is no active character', () => {
    const out = deriveSessionIdentity({ user: baseUser, session: baseSession, active: null, isAdmin: notAdmin });
    expect(out.characterId).toBeNull();
    expect(out.name).toBe('User Name');
    expect(out.portraitUrl).toBe('user-image.png');
  });

  it('falls back to the user name/image when the character profile is unwritten (null fields)', () => {
    const active: ActiveCharacter = { characterId: 7, name: null, portraitUrl: null };
    const out = deriveSessionIdentity({ user: baseUser, session: baseSession, active, isAdmin: notAdmin });
    expect(out.characterId).toBe(7);
    expect(out.name).toBe('User Name');
    expect(out.portraitUrl).toBe('user-image.png');
  });

  it('uses an empty string for portrait when neither character nor user has an image', () => {
    const out = deriveSessionIdentity({
      user: { ...baseUser, image: null },
      session: baseSession,
      active: null,
      isAdmin: notAdmin,
    });
    expect(out.portraitUrl).toBe('');
  });

  it('defaults the role to USER when the user carries none', () => {
    const out = deriveSessionIdentity({
      user: { id: 'u2', name: 'No Role', image: null },
      session: baseSession,
      active: null,
      isAdmin: notAdmin,
    });
    expect(out.role).toBe('USER');
  });

  it('feeds the resolved characterId + role to the injected isAdmin and returns its verdict', () => {
    const isAdmin = vi.fn(() => true);
    const active: ActiveCharacter = { characterId: 99, name: 'Boss', portraitUrl: 'boss.png' };
    const out = deriveSessionIdentity({
      user: { ...baseUser, role: 'ADMIN' },
      session: baseSession,
      active,
      isAdmin,
    });
    expect(isAdmin).toHaveBeenCalledWith(99, 'ADMIN');
    expect(out.isAdmin).toBe(true);
  });

  it('passes the raw user and session through by reference', () => {
    const out = deriveSessionIdentity({ user: baseUser, session: baseSession, active: null, isAdmin: notAdmin });
    expect(out.user).toBe(baseUser);
    expect(out.session).toBe(baseSession);
  });
});
