import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackingControls, TrackingHeartbeat } from './TrackingControls';

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  toastError: vi.fn(),
  scannerCharacterId: null as number | null,
  setScanner: vi.fn(),
  mutate: vi.fn(async () => ({ tracked: true })),
  queryResult: {
    tracked: [
      { characterId: 101, location: null },
      { characterId: 999, location: null },
    ],
    ownTrackedCharacterIds: [101],
  },
  accessResult: { granted: true, canEdit: true, trackableCharacterIds: null as number[] | null },
  afk: { paused: false, promptOpen: false, dismiss: vi.fn() },
  characters: [
    {
      characterId: 101,
      name: 'Alice Own',
      portraitUrl: '/alice.png',
      needsReconnect: false,
      needsLocationReconnect: false,
    },
    {
      characterId: 202,
      name: 'Bob Own',
      portraitUrl: '/bob.png',
      needsReconnect: true,
      needsLocationReconnect: false,
    },
  ],
}));

vi.mock('@/components/ui/toast', () => ({ toast: { error: mocks.toastError } }));

vi.mock('@/data/convex/use-mutation', () => ({
  useMutation: () => mocks.mutate,
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (query: string) =>
    query === 'map-access' ? mocks.accessResult : mocks.queryResult,
}));

vi.mock('@/data/convex/api', () => ({
  api: {
    mapChainAccess: { watchMapAccess: 'map-access' },
    mapTrackingLive: { forMap: 'map-tracking' },
    mapTrackingOptIn: { setTracking: 'set-tracking' },
  },
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => mocks.characters,
}));

vi.mock('@/data/convex/use-sync-subject', () => ({
  useSyncSubject: (...args: unknown[]) => mocks.heartbeat(...args),
}));

vi.mock('./AfkGate', () => ({
  AfkDialog: () => null,
  useAfkState: () => mocks.afk,
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) =>
    createElement('img', { alt: name }),
}));

vi.mock('@/components/ui/menu', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/menu')>(),
  MenuCheckboxItem: (props: {
    checked: boolean;
    children?: ReactNode;
    onCheckedChange: (checked: boolean) => void;
    'aria-label': string;
    'data-tracking-reconnect'?: string;
  }) =>
    createElement(
      'button',
      {
        type: 'button',
        'data-tracking-portrait': props['aria-label'],
        'data-tracking-reconnect': props['data-tracking-reconnect'],
        'aria-checked': props.checked,
        onClick: () => props.onCheckedChange(!props.checked),
      },
      props.children,
    ),
  menuControlRow: 'menu-control-row',
}));

vi.mock('@/components/PreferencesProvider', () => ({
  usePreference: () => [mocks.scannerCharacterId, mocks.setScanner],
}));

vi.mock('@/components/ui/select', () => ({
  Select: (props: {
    value: string;
    ariaLabel: string;
    items: readonly { value: string; label: string }[];
  }) =>
    createElement(
      'select',
      { 'aria-label': props.ariaLabel, value: props.value, onChange: () => undefined },
      props.items.map((item) =>
        createElement('option', { key: item.value, value: item.value }, item.label),
      ),
    ),
}));

describe('TrackingControls', () => {
  const reconnectAction = createElement('button', { type: 'button' }, 'Reconnect');

  beforeEach(() => {
    mocks.heartbeat.mockClear();
    mocks.mutate.mockClear();
    mocks.characters[0]!.needsReconnect = false;
    mocks.characters[0]!.needsLocationReconnect = false;
    mocks.characters[1]!.needsReconnect = true;
    mocks.characters[1]!.needsLocationReconnect = false;
    mocks.queryResult.ownTrackedCharacterIds = [101];
    mocks.accessResult.trackableCharacterIds = null;
  });

  it('offers only the characters this map lets the caller track', () => {
    mocks.accessResult.trackableCharacterIds = [202];
    const markup = renderToStaticMarkup(
      TrackingControls({ mapId: 'map-a', reconnectAction }) as ReactElement,
    );
    expect(markup).toContain('data-tracking-portrait="Track Bob Own"');
    expect(markup).not.toContain('data-tracking-portrait="Stop tracking Alice Own"');

    mocks.accessResult.trackableCharacterIds = [];
    const empty = renderToStaticMarkup(
      TrackingControls({ mapId: 'map-a', reconnectAction }) as ReactElement,
    );
    expect(empty).toContain('None of your characters are on this map&#x27;s access list');
    expect(empty).not.toContain('data-tracking-portrait');
  });

  it('renders owned portraits as tracking toggles and keeps the heartbeat mounted independently', async () => {
    const element = TrackingControls({ mapId: 'map-a', reconnectAction });
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error('tracking controls did not render');

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain('data-map-tracking');
    expect(markup).not.toContain('Map settings');
    expect(markup).toContain('Tracking');
    expect(markup).toContain('aria-label="Tracking"');
    expect(markup).toContain('Alice Own');
    expect(markup).toContain('Bob Own');
    expect(markup).not.toContain('999');
    expect(markup).toContain('data-tracking-portrait="Stop tracking Alice Own"');
    expect(markup).toContain('data-tracking-portrait="Track Bob Own"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).not.toContain('Cannot sync location');
    expect(markup).not.toContain('data-tracking-reconnect-action');
    expect(markup).toContain('data-default-scanner');
    expect(markup).toContain('aria-label="Default scanner"');
    expect(markup).toContain('<option value="ask" selected="">Ask when unclear</option>');
    expect(markup).toContain('<option value="202">Bob Own</option>');

    const view = element as ReactElement<{
      onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
    }>;
    await view.props.onToggle(202, true);
    expect(mocks.mutate).toHaveBeenCalledWith({
      mapId: 'map-a',
      characterId: 202,
      tracked: true,
    });

    TrackingHeartbeat({ mapId: 'map-a' });
    expect(mocks.heartbeat).toHaveBeenCalledWith('characterLocation', [101]);
  });

  it('explains a refused tracking change instead of dropping the rejection', async () => {
    const detail = 'This map has reached its tracking limit.';
    mocks.mutate.mockRejectedValueOnce({ data: { code: 'TRACKING_MAP_CAP_EXCEEDED', detail } });
    const view = TrackingControls({ mapId: 'map-a', reconnectAction }) as ReactElement<{
      onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
    }>;
    await view.props.onToggle(202, true);
    expect(mocks.toastError).toHaveBeenCalledWith('Tracking was not changed', {
      description: detail,
    });
  });

  it('surfaces location reconnect on the control even when skill-queue health is fine', () => {
    mocks.characters[0]!.needsReconnect = false;
    mocks.characters[0]!.needsLocationReconnect = true;
    const element = TrackingControls({ mapId: 'map-a', reconnectAction });
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error('tracking controls did not render');

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain(
      'data-tracking-portrait="Stop tracking Alice Own (cannot sync location)"',
    );
    expect(markup).toContain('data-tracking-reconnect="true"');
    expect(markup).toContain('Cannot sync location');
    expect(markup).toContain('data-tracking-reconnect-action');
    expect(markup).toContain('Reconnect');
    expect(markup).toContain('data-tracking-portrait="Track Bob Own"');
  });

  it('empties the heartbeat character set while the AFK gate is paused', () => {
    mocks.afk.paused = true;
    try {
      TrackingHeartbeat({ mapId: 'map-a' });
      expect(mocks.heartbeat).toHaveBeenCalledWith('characterLocation', []);
    } finally {
      mocks.afk.paused = false;
    }
  });

  it('shows the chosen default scanner and hides the row for a single character', () => {
    mocks.scannerCharacterId = 202;
    try {
      const element = TrackingControls({ mapId: 'map-a', reconnectAction });
      if (!isValidElement(element)) throw new Error('tracking controls did not render');
      expect(renderToStaticMarkup(element)).toContain(
        '<option value="202" selected="">Bob Own</option>',
      );
      const removed = mocks.characters.splice(1, 1);
      try {
        const single = TrackingControls({ mapId: 'map-a', reconnectAction });
        if (!isValidElement(single)) throw new Error('tracking controls did not render');
        expect(renderToStaticMarkup(single)).not.toContain('data-default-scanner');
      } finally {
        mocks.characters.push(...removed);
      }
    } finally {
      mocks.scannerCharacterId = null;
    }
  });
});
