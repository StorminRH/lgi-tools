import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  registerSearchSource,
  listRegisteredSources,
  __resetSearchSources,
  type SearchContext,
} from '@/platform/search';
import { commandsSearchSource } from './commands-source';
import type { Session } from '@/platform/auth/types';

const signOut = vi.hoisted(() => vi.fn());
const signInOauth2 = vi.hoisted(() => vi.fn());

vi.mock('@/platform/auth/auth-client', () => ({
  authClient: { signOut, signIn: { oauth2: signInOauth2 } },
}));

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
  it('filters by substring and exposes auth onSelect handlers without a discriminator', async () => {
    expect((await runCommands('changelog', ctx())).map((r) => r.label)).toEqual([
      'Open changelog',
    ]);
    const login = (await runCommands('log', ctx())).find((r) => r.label === 'Log in with EVE');
    const logout = (await runCommands('log', ctx({ session: mockSession() }))).find(
      (r) => r.label === 'Log out',
    );
    expect(typeof login?.onSelect).toBe('function');
    expect(typeof logout?.onSelect).toBe('function');
  });
});

// The two side-effecting rows delegate to the official Better Auth client.
// These pin the navigation semantics the hand-rolled REST calls used to own.
describe('command auth side effects', () => {
  const stubLocation = () => {
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    return location;
  };

  const fire = async (label: string, context: SearchContext) => {
    const row = (await runCommands('log', context)).find((r) => r.label === label);
    if (!row?.onSelect) throw new Error(`${label} has no onSelect handler`);
    row.onSelect({} as never);
    await vi.waitFor(() => {
      expect(signOut.mock.calls.length + signInOauth2.mock.calls.length).toBeGreaterThan(0);
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('navigates home only after sign-out succeeds', async () => {
    const location = stubLocation();
    signOut.mockResolvedValue({ data: { success: true }, error: null });

    await fire('Log out', ctx({ session: mockSession() }));

    await vi.waitFor(() => {
      expect(location.href).toBe('/');
    });
  });

  it('stays put when sign-out returns an error', async () => {
    const location = stubLocation();
    signOut.mockResolvedValue({ data: null, error: { status: 500 } });

    await fire('Log out', ctx({ session: mockSession() }));

    await Promise.resolve();
    expect(location.href).toBe('');
  });

  it('stays put when sign-out rejects', async () => {
    const location = stubLocation();
    signOut.mockRejectedValue(new TypeError('Failed to fetch'));

    await fire('Log out', ctx({ session: mockSession() }));

    await Promise.resolve();
    expect(location.href).toBe('');
  });

  it('asks the client for the EVE provider with the home callback', async () => {
    stubLocation();
    signInOauth2.mockResolvedValue({ data: { url: 'https://login.eveonline.test' }, error: null });

    await fire('Log in with EVE', ctx());

    expect(signInOauth2).toHaveBeenCalledWith({ providerId: 'eve', callbackURL: '/' });
  });

  it('navigates nowhere when sign-in rejects', async () => {
    const location = stubLocation();
    signInOauth2.mockRejectedValue(new TypeError('Failed to fetch'));

    await fire('Log in with EVE', ctx());

    await Promise.resolve();
    expect(location.href).toBe('');
  });
});
