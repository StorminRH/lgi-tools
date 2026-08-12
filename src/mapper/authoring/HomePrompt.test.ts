import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomePrompt } from './HomePrompt';

const mocks = vi.hoisted(() => ({
  characterId: 101 as number | null,
  tracking: undefined as
    | {
        ownTrackedCharacterIds: readonly number[];
        tracked: readonly {
          characterId: number;
          location: { solarSystemId: number } | null;
        }[];
      }
    | undefined,
  freshness: undefined as
    | { fresh: readonly { characterId: number; feedFreshAt: number | null }[] }
    | undefined,
  systemName: null as string | null,
  setTracking: vi.fn(),
  onPick: vi.fn(),
}));

vi.mock('@/components/use-account-characters', () => ({
  useActiveCharacterId: () => mocks.characterId,
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (query: string) =>
    query === 'map-tracking' ? mocks.tracking : mocks.freshness,
}));

vi.mock('../tracking/TrackingControls', () => ({
  useSetMapTracking: () => mocks.setTracking,
}));

vi.mock('@/data/convex/api', () => ({
  api: {
    mapTracking: {
      forMap: 'map-tracking',
      feedFreshness: 'feed-freshness',
      setTracking: 'set-tracking',
    },
  },
}));

vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({
    parse: () => ({ ok: false, error: { kind: 'not_found' } }),
    suggest: async () => [],
  }),
  useSystemName: () => mocks.systemName,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    createElement('div', { role: 'dialog' }, children),
  DialogTitle: ({ children, id }: { children: React.ReactNode; id?: string }) =>
    createElement('h2', { id }, children),
}));

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: { placeholder?: string }) =>
    createElement('div', {
      'data-terminal-search': '',
      'data-placeholder': props.placeholder ?? '',
    }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: Record<string, unknown> & { children?: unknown }) =>
    createElement('button', props, children as never),
}));

function renderPrompt(): string {
  return renderToStaticMarkup(
    createElement(HomePrompt, { mapId: 'map-a', onPick: mocks.onPick }),
  );
}

describe('HomePrompt', () => {
  it('uses the dialog shell and switches current-system copy with tracking coverage', () => {
    mocks.characterId = 101;
    mocks.tracking = undefined;
    mocks.freshness = undefined;
    mocks.systemName = null;
    mocks.onPick.mockReset();

    const loading = renderPrompt();
    expect(loading).toContain('role="dialog"');
    expect(loading).toContain('Set your home system');
    expect(loading).toContain('data-map-home-prompt');
    expect(loading).toContain('Search systems — type a name');
    expect(loading).toContain('Use current system');
    expect(loading).toContain('data-map-home-current-disabled');
    expect(loading).not.toContain('Start tracking');
    expect(loading).not.toContain('Atlas · new map');
    expect(loading).not.toContain('Requires live tracking');
    expect(loading).not.toContain('4.0.4.2');

    mocks.tracking = { ownTrackedCharacterIds: [], tracked: [] };
    mocks.freshness = { fresh: [] };
    const untracked = renderPrompt();
    expect(untracked).toContain('data-map-home-start-tracking');
    expect(untracked).toContain('Start tracking');
    expect(untracked).not.toContain('Use current system');

    mocks.tracking = {
      ownTrackedCharacterIds: [101],
      tracked: [{ characterId: 101, location: { solarSystemId: 30_000_142 } }],
    };
    mocks.freshness = { fresh: [{ characterId: 101, feedFreshAt: null }] };
    const offline = renderPrompt();
    expect(offline).toContain('Use current system');
    expect(offline).toContain('Character is offline');
    expect(offline).toContain('data-map-home-current-disabled');

    mocks.freshness = { fresh: [{ characterId: 101, feedFreshAt: 1 }] };
    mocks.systemName = 'Jita';
    const live = renderPrompt();
    expect(live).not.toContain('data-map-home-current-disabled');
    expect(live).toContain('data-map-home-current="30000142"');
    expect(live).toContain('Jita');
    expect(live).not.toContain('Character is offline');
  });
});
