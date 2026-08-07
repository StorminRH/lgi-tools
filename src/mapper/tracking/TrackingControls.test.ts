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
  mutate: vi.fn(async () => ({ tracked: true })),
  queryResult: {
    tracked: [
      { userId: 'viewer', characterId: 101, location: null },
      { userId: 'other', characterId: 999, location: null },
    ],
    ownTrackedCharacterIds: [101],
  },
  accessResult: { granted: true, canEdit: true },
  characters: [
    {
      characterId: 101,
      name: 'Alice Own',
      portraitUrl: '/alice.png',
      needsReconnect: false,
    },
    {
      characterId: 202,
      name: 'Bob Own',
      portraitUrl: '/bob.png',
      needsReconnect: false,
    },
  ],
}));

vi.mock('@/data/convex/use-mutation', () => ({
  useMutation: () => mocks.mutate,
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (query: string) =>
    query === 'map-access' ? mocks.accessResult : mocks.queryResult,
}));

vi.mock('@/data/convex/api', () => ({
  api: {
    mapChain: { watchMapAccess: 'map-access' },
    mapTracking: { forMap: 'map-tracking', setTracking: 'set-tracking' },
  },
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => mocks.characters,
}));

vi.mock('@/data/convex/use-sync-subject', () => ({
  useSyncSubject: (...args: unknown[]) => mocks.heartbeat(...args),
}));

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) =>
    createElement('img', { alt: name }),
}));

vi.mock('@/components/ui/menu', () => ({
  MenuCheckboxItem: (props: {
    checked: boolean;
    children?: ReactNode;
    onCheckedChange: (checked: boolean) => void;
    'aria-label': string;
  }) =>
    createElement('button', {
      type: 'button',
      'data-tracking-portrait': props['aria-label'],
      'aria-checked': props.checked,
      onClick: () => props.onCheckedChange(!props.checked),
    }, props.children),
  menuSection: 'menu-section',
  menuSectionLabel: 'menu-section-label',
}));

describe('TrackingControls', () => {
  beforeEach(() => {
    mocks.heartbeat.mockClear();
    mocks.mutate.mockClear();
  });

  it('renders owned portraits as tracking toggles and keeps the heartbeat mounted independently', async () => {
    const element = TrackingControls({ mapId: 'map-a' });
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

    const view = element as ReactElement<{
      onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
    }>;
    await view.props.onToggle(202, true);
    expect(mocks.mutate).toHaveBeenCalledWith({
      mapId: 'map-a',
      characterId: 202,
      tracked: true,
    });

    expect(TrackingHeartbeat({ mapId: 'map-a' })).toBeNull();
    expect(mocks.heartbeat).toHaveBeenCalledWith('characterLocation', [101]);
  });
});
