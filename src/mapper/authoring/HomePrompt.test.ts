import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortraitToggleChange } from '@/components/character-portrait-picker';
import { HomePrompt } from './HomePrompt';

const mocks = vi.hoisted(() => ({
  characterId: 101 as number | null,
  characters: [] as
    | {
        characterId: number;
        name: string;
        portraitUrl: string;
        needsReconnect: boolean;
        needsLocationReconnect: boolean;
      }[]
    | null,
  access: { granted: true, canEdit: true, trackableCharacterIds: null } as
    | { granted: boolean; canEdit: boolean; trackableCharacterIds: number[] | null }
    | undefined,
  tracking: undefined as
    | {
        ownTrackedCharacterIds: readonly number[];
        tracked: readonly {
          userId: string;
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
  toggleTracking: vi.fn(async () => undefined),
  toggleMapIds: [] as string[],
  buttonProps: vi.fn(),
  pickerProps: vi.fn(),
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

vi.mock('@/components/character-portrait-picker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/character-portrait-picker')>();
  return {
    ...actual,
    CharacterPortraitPicker: (props: Parameters<typeof actual.CharacterPortraitPicker>[0]) => {
      mocks.pickerProps(props);
      return actual.CharacterPortraitPicker(props);
    },
  };
});

vi.mock('@/components/ui/button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/button')>();
  return {
    ...actual,
    Button: (props: Parameters<typeof actual.Button>[0]) => {
      mocks.buttonProps(props);
      return actual.Button(props);
    },
  };
});

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (query: unknown) => {
    if (query === 'map-access') return mocks.access;
    return query === 'map-tracking-coverage' ? mocks.coverage : mocks.tracking;
  },
}));

vi.mock('../tracking/TrackingControls', () => ({
  useMapTrackingToggle: (mapId: string) => {
    mocks.toggleMapIds.push(mapId);
    return mocks.toggleTracking;
  },
}));

vi.mock('@/data/convex/api', () => ({
  api: {
    mapChainAccess: { watchMapAccess: 'map-access' },
    mapTrackingLive: {
      forMap: 'map-tracking',
      coverage: 'map-tracking-coverage',
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

vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});

vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: { placeholder?: string }) =>
    createElement('div', {
      'data-terminal-search': '',
      'data-placeholder': props.placeholder ?? '',
    }),
}));

function renderPrompt(): string {
  return renderToStaticMarkup(
    createElement(HomePrompt, { mapId: 'map-a', onPick: mocks.onPick }),
  );
}

function pilots(locationReconnectId: number | null = null) {
  return [
    { characterId: 101, name: 'Session Pilot', portraitUrl: '/session.png' },
    { characterId: 202, name: 'In Space', portraitUrl: '/space.png' },
  ].map((character) => ({
    ...character,
    needsReconnect: false,
    needsLocationReconnect: character.characterId === locationReconnectId,
  }));
}

function trackingBoth() {
  mocks.tracking = {
    ownTrackedCharacterIds: [101, 202],
    tracked: [
      { userId: 'owner', characterId: 101, location: null },
      { userId: 'owner', characterId: 202, location: { solarSystemId: 31_001_677 } },
    ],
  };
  mocks.coverage = {
    coverage: [
      { characterId: 101, covered: false },
      { characterId: 202, covered: true },
    ],
  };
}

function lastPickerToggle(): (change: PortraitToggleChange) => void {
  const props = mocks.pickerProps.mock.lastCall?.[0] as
    | { onToggle: (change: PortraitToggleChange) => void }
    | undefined;
  if (props === undefined) throw new Error('the tracking picker did not render');
  return props.onToggle;
}

function startTrackingClick(): () => void {
  const props = mocks.buttonProps.mock.calls
    .map(([call]) => call as Record<string, unknown>)
    .findLast((call) => call['data-map-home-start-tracking'] === true);
  if (props === undefined) throw new Error('Start tracking did not render');
  return props['onClick'] as () => void;
}

beforeEach(() => {
  mocks.characterId = 101;
  mocks.characters = [];
  mocks.access = { granted: true, canEdit: true, trackableCharacterIds: null };
  mocks.tracking = undefined;
  mocks.coverage = undefined;
  mocks.systemName = null;
  mocks.toggleTracking.mockClear();
  mocks.toggleMapIds = [];
  mocks.buttonProps.mockClear();
  mocks.pickerProps.mockClear();
  mocks.onPick.mockReset();
});

describe('HomePrompt', () => {
  it('uses the dialog shell and switches current-system copy with tracking coverage', () => {
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
      tracked: [{ userId: 'owner', characterId: 101, location: { solarSystemId: 30_000_142 } }],
    };
    mocks.coverage = { coverage: [{ characterId: 101, covered: false }] };
    const offline = renderPrompt();
    expect(offline).toContain('Use current system');
    expect(offline).toContain('Character is offline');
    expect(offline).toContain('data-map-home-current-disabled');

    mocks.tracking = {
      ownTrackedCharacterIds: [101],
      tracked: [{ userId: 'owner', characterId: 101, location: { solarSystemId: 30_000_142 } }],
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
    mocks.characters = pilots();
    trackingBoth();
    mocks.systemName = 'J113551';

    const html = renderPrompt();
    expect(html).toContain('data-map-home-tracking');
    expect(html).toContain('Track a character in space');
    expect(html).toContain('role="group" aria-label="Tracking"');
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Stop tracking Session Pilot"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Stop tracking In Space"/);
    expect(html).not.toContain('data-tracking-reconnect');
    expect(html).toContain('data-map-home-current="31001677"');
    expect(html).toContain('J113551');
    expect(html).not.toContain('Character is offline');
  });

  it('offers only the characters the map lets the caller track, once access is known', () => {
    mocks.characters = pilots();
    trackingBoth();

    mocks.access = { granted: true, canEdit: true, trackableCharacterIds: [202] };
    const scoped = renderPrompt();
    expect(scoped).toMatch(/aria-label="Stop tracking In Space"/);
    expect(scoped).not.toContain('Session Pilot');

    mocks.access = { granted: true, canEdit: true, trackableCharacterIds: [] };
    expect(renderPrompt()).not.toContain('data-map-home-tracking');

    mocks.access = undefined;
    expect(renderPrompt()).not.toContain('data-map-home-tracking');

    mocks.access = { granted: true, canEdit: true, trackableCharacterIds: null };
    mocks.tracking = undefined;
    expect(renderPrompt()).not.toContain('data-map-home-tracking');
  });

  it('labels and outlines a character that must reconnect to sync location', () => {
    mocks.characters = pilots(101);
    trackingBoth();

    const html = renderPrompt();
    expect(html).toMatch(
      /aria-label="Stop tracking Session Pilot \(cannot sync location\)"[^>]*data-tracking-reconnect="true"/,
    );
    expect(html).toMatch(/aria-label="Stop tracking In Space"/);
    expect(html.match(/data-tracking-reconnect/g)).toHaveLength(1);
  });

  it('routes the portraits and Start tracking through the map tracking toggle', () => {
    mocks.characters = pilots();
    mocks.tracking = { ownTrackedCharacterIds: [], tracked: [] };
    mocks.coverage = { coverage: [] };

    const html = renderPrompt();
    expect(html).toContain('data-map-home-start-tracking');
    expect(new Set(mocks.toggleMapIds)).toEqual(new Set(['map-a']));

    startTrackingClick()();
    expect(mocks.toggleTracking).toHaveBeenLastCalledWith(101, true);

    lastPickerToggle()({ characterId: 202, selected: true });
    expect(mocks.toggleTracking).toHaveBeenLastCalledWith(202, true);
    expect(mocks.toggleTracking).toHaveBeenCalledTimes(2);
  });
});
