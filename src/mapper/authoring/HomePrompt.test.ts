import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomePrompt } from './HomePrompt';

const mocks = vi.hoisted(() => ({
  characterId: 101 as number | null,
  characters: [] as
    | {
        characterId: number;
        name: string;
        portraitUrl: string;
        needsReconnect: boolean;
      }[]
    | null,
  tracking: undefined as
    | {
        ownTrackedCharacterIds: readonly number[];
        tracked: readonly {
          characterId: number;
          location: { solarSystemId: number } | null;
        }[];
      }
    | undefined,
  coverage: undefined as
    | {
        coverage: readonly {
          characterId: number;
          covered: boolean;
        }[];
      }
    | undefined,
  systemName: null as string | null,
  setTracking: vi.fn(),
  onPick: vi.fn(),
}));

vi.mock('@/components/use-account-characters', () => ({
  useActiveCharacterId: () => mocks.characterId,
  useAccountCharacters: () => mocks.characters,
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) =>
    createElement('img', { alt: name }),
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (query: unknown) =>
    query === 'map-tracking-coverage' ? mocks.coverage : mocks.tracking,
}));

vi.mock('../tracking/TrackingControls', () => ({
  useSetMapTracking: () => mocks.setTracking,
}));

vi.mock('@/data/convex/api', () => ({
  api: {
    mapTracking: {
      forMap: 'map-tracking',
      coverage: 'map-tracking-coverage',
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
    mocks.characters = [];
    mocks.tracking = undefined;
    mocks.coverage = undefined;
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

    mocks.tracking = { ownTrackedCharacterIds: [], tracked: [] };
    mocks.coverage = { coverage: [] };
    const untracked = renderPrompt();
    expect(untracked).toContain('data-map-home-start-tracking');
    expect(untracked).toContain('Start tracking');
    expect(untracked).not.toContain('Use current system');

    mocks.tracking = {
      ownTrackedCharacterIds: [101],
      tracked: [{ characterId: 101, location: { solarSystemId: 30_000_142 } }],
    };
    mocks.coverage = { coverage: [{ characterId: 101, covered: false }] };
    const offline = renderPrompt();
    expect(offline).toContain('Use current system');
    expect(offline).toContain('Character is offline');
    expect(offline).toContain('data-map-home-current-disabled');

    mocks.tracking = {
      ownTrackedCharacterIds: [101],
      tracked: [{ characterId: 101, location: { solarSystemId: 30_000_142 } }],
    };
    mocks.coverage = { coverage: [{ characterId: 101, covered: true }] };
    mocks.systemName = 'Jita';
    const live = renderPrompt();
    expect(live).not.toContain('data-map-home-current-disabled');
    expect(live).toContain('data-map-home-current="30000142"');
    expect(live).toContain('Jita');
    expect(live).not.toContain('Character is offline');
  });

  it('lists linked characters as tracking toggles and uses a live alt as current system', () => {
    mocks.characterId = 101;
    mocks.characters = [
      {
        characterId: 101,
        name: 'Session Pilot',
        portraitUrl: '/session.png',
        needsReconnect: false,
      },
      {
        characterId: 202,
        name: 'In Space',
        portraitUrl: '/space.png',
        needsReconnect: false,
      },
    ];
    mocks.tracking = {
      ownTrackedCharacterIds: [101, 202],
      tracked: [
        { characterId: 101, location: null },
        { characterId: 202, location: { solarSystemId: 31_001_677 } },
      ],
    };
    mocks.coverage = {
      coverage: [
        { characterId: 101, covered: false },
        { characterId: 202, covered: true },
      ],
    };
    mocks.systemName = 'J113551';

    const html = renderPrompt();
    expect(html).toContain('data-map-home-tracking');
    expect(html).toContain('Track a character in space');
    expect(html).toContain('data-map-home-track-character="101"');
    expect(html).toContain('data-map-home-track-character="202"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Stop tracking Session Pilot');
    expect(html).toContain('Stop tracking In Space');
    expect(html).toContain('data-map-home-current="31001677"');
    expect(html).toContain('J113551');
    expect(html).not.toContain('Character is offline');
  });
});
