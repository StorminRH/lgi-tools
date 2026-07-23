import { beforeAll, describe, expect, it } from 'vitest';
import {
  registerSearchSource,
  listRegisteredSources,
  __resetSearchSources,
  type SearchContext,
} from '@/search';
import { commandsSearchSource } from './search';
import type { Session } from '@/platform/auth/types';

// Each vitest file gets its own module graph, so we start with a clean
// registry, then register the Commands source the way the wiring manifest
// does — by pulling its exported value.
beforeAll(() => {
  __resetSearchSources();
  registerSearchSource(commandsSearchSource);
});

function mockSession(): Session {
  return {
    characterId: 12345,
    name: 'Test Pilot',
    portraitUrl: '',
    role: 'USER',
  };
}

function ctx(over: Partial<SearchContext> = {}): SearchContext {
  return {
    session: null,
    isAdmin: false,
    recents: [],
    ...over,
  };
}

async function runCommands(query: string, c: SearchContext) {
  const source = listRegisteredSources().find((s) => s.name === 'Commands');
  if (!source) throw new Error('Commands source not registered');
  return source.search(query, c);
}

describe('commands search source', () => {
  it('surfaces "Open changelog" for everyone', async () => {
    const out = await runCommands('changelog', ctx());
    expect(out.map((r) => r.label)).toContain('Open changelog');
  });

  it('shows "Log in with EVE" only when logged out', async () => {
    const loggedOut = await runCommands('log', ctx());
    expect(loggedOut.map((r) => r.label)).toContain('Log in with EVE');

    const loggedIn = await runCommands('log', ctx({ session: mockSession() }));
    expect(loggedIn.map((r) => r.label)).not.toContain('Log in with EVE');
  });

  it('shows "Log out" only when logged in', async () => {
    const loggedOut = await runCommands('log', ctx());
    expect(loggedOut.map((r) => r.label)).not.toContain('Log out');

    const loggedIn = await runCommands('log', ctx({ session: mockSession() }));
    expect(loggedIn.map((r) => r.label)).toContain('Log out');
  });

  it('shows "Open admin" only when isAdmin is true', async () => {
    const notAdmin = await runCommands('admin', ctx({ session: mockSession() }));
    expect(notAdmin.map((r) => r.label)).not.toContain('Open admin');

    const admin = await runCommands('admin', ctx({ session: mockSession(), isAdmin: true }));
    expect(admin.map((r) => r.label)).toContain('Open admin');
  });

  it('exposes an onSelect handler on Log out (no command discriminator)', async () => {
    const out = await runCommands('log', ctx({ session: mockSession() }));
    const logout = out.find((r) => r.label === 'Log out');
    expect(typeof logout?.onSelect).toBe('function');
  });

  it('exposes an onSelect handler on Log in (no command discriminator)', async () => {
    const out = await runCommands('log', ctx());
    const login = out.find((r) => r.label === 'Log in with EVE');
    expect(typeof login?.onSelect).toBe('function');
  });

  it('filters by substring match against the label', async () => {
    const out = await runCommands('changelog', ctx());
    expect(out.map((r) => r.label)).toEqual(['Open changelog']);
  });
});
