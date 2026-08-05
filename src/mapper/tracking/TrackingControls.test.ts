import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackingControls } from './TrackingControls';

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
  useLiveValue: () => mocks.queryResult,
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => mocks.characters,
}));

vi.mock('@/data/convex/use-sync-subject', () => ({
  useSyncSubject: (...args: unknown[]) => mocks.heartbeat(...args),
}));

vi.mock('@xyflow/react', () => ({
  Panel: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('section', props, children),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: (props: {
    checked: boolean;
    label: string;
    onCheckedChange: (checked: boolean) => void;
  }) =>
    createElement('button', {
      type: 'button',
      'data-tracking-switch': props.label,
      'aria-pressed': props.checked,
      onClick: () => props.onCheckedChange(!props.checked),
    }),
}));

describe('TrackingControls', () => {
  beforeEach(() => {
    mocks.heartbeat.mockClear();
    mocks.mutate.mockClear();
  });

  it('renders only the account roster, fires the map mutation, and mounts the tracked heartbeat', async () => {
    const element = TrackingControls({ mapId: 'map-a' });
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error('tracking controls did not render');

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain('Alice Own');
    expect(markup).toContain('Bob Own');
    expect(markup).not.toContain('999');
    expect(mocks.heartbeat).toHaveBeenCalledWith('characterLocation', [101]);

    const view = element as ReactElement<{
      onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
    }>;
    await view.props.onToggle(202, true);
    expect(mocks.mutate).toHaveBeenCalledWith({
      mapId: 'map-a',
      characterId: 202,
      tracked: true,
    });
  });
});
