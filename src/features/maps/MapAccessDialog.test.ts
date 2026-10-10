import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PortraitToggleChange } from '@/components/character-portrait-picker';
import type * as MapAccessClient from './map-access-client';
import type * as OwnPickerModule from './OwnCharacterPicker';

const actions = vi.hoisted(() => ({
  toggleOwnCharacter: undefined as ((change: PortraitToggleChange) => void) | undefined,
  updateMapAccess: vi.fn(),
}));

vi.mock('./map-access-client', async (importOriginal) => ({
  ...await importOriginal<typeof MapAccessClient>(),
  updateMapAccess: actions.updateMapAccess,
}));

vi.mock('./OwnCharacterPicker', async (importOriginal) => {
  const actual = await importOriginal<typeof OwnPickerModule>();
  return {
    ...actual,
    OwnCharacterPicker: (props: Parameters<typeof actual.OwnCharacterPicker>[0]) => {
      actions.toggleOwnCharacter = props.onToggle;
      return createElement(actual.OwnCharacterPicker, props);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('map=map-a'),
}));

// Stub the Base layer so the real ui/dialog chrome renders as static markup.
vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({ children }: { children: React.ReactNode }) => children,
    Portal: ({ children }: { children: React.ReactNode }) => children,
    Backdrop: () => null,
    Popup: ({
      children,
      finalFocus,
    }: {
      children: React.ReactNode;
      finalFocus?: React.RefObject<HTMLElement | null>;
    }) =>
      createElement(
        'div',
        { role: 'dialog', 'data-has-final-focus': String(finalFocus !== undefined) },
        children,
      ),
    Close: ({
      children,
      disabled,
      'aria-label': label,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      'aria-label'?: string;
    }) => createElement('button', { 'aria-label': label, disabled }, children),
    Description: ({ children }: { children: React.ReactNode }) =>
      createElement('p', null, children),
    Title: ({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) =>
      createElement('h2', { id, className }, children),
  },
}));

vi.mock('@/components/use-account-characters', () => ({
  useAccountCharacters: () => [
    { characterId: 42, name: 'Scout', portraitUrl: 'https://images.evetech.net/characters/42/portrait' },
    { characterId: 43, name: 'Hauler', portraitUrl: 'https://images.evetech.net/characters/43/portrait' },
  ],
}));

vi.mock('./CharacterSearchControl', () => ({
  CharacterSearchControl: () => createElement('div', { 'data-character-search': '' }),
}));

vi.mock('./AccessListEditor', () => ({
  AccessListEditor: ({
    mode,
    currentGrants,
    characterSearch,
  }: {
    mode: string;
    currentGrants: readonly { ownerId: number; name: string; role: string }[];
    characterSearch: React.ReactNode;
  }) =>
    createElement(
      'div',
      {
        'data-access-editor-mode': mode,
        'data-access-grants': currentGrants
          .map((grant) => `${grant.ownerId}:${grant.name}:${grant.role}`)
          .join(','),
      },
      characterSearch,
    ),
}));

import {
  MapAccessDialog,
  mapAccessGrantRevision,
  reconcileAccessGrantDrafts,
} from './MapAccessDialog';

describe('MapAccessDialog', () => {
  it('selects an own tracking character with viewer access', async () => {
    actions.updateMapAccess.mockReset().mockResolvedValue({ ok: true });
    renderToStaticMarkup(createElement(MapAccessDialog, {
      mapId: 'map-a', mapName: 'Alpha', open: true,
      onOpenChange: vi.fn(), finalFocus: { current: null },
      corporations: [], initialGrants: [], initialBlocks: [],
    }));
    expect(actions.toggleOwnCharacter).toBeDefined();
    actions.toggleOwnCharacter?.({ characterId: 43, selected: true });
    expect(actions.updateMapAccess).toHaveBeenCalledExactlyOnceWith({
      operation: 'upsert', mapId: 'map-a',
      grant: { ownerType: 'character', ownerId: 43, role: 'viewer' },
    });
  });

  it('seeds the shared manage editor with presentation-ready delegated grants', () => {
    const markup = renderToStaticMarkup(
      createElement(MapAccessDialog, {
        mapId: 'map-a',
        mapName: 'Alpha',
        open: true,
        onOpenChange: vi.fn(),
        finalFocus: { current: null },
        corporations: [{ corporationId: 99, name: 'Signal Cartel' }],
        initialGrants: [
          {
            ownerType: 'character',
            ownerId: 42,
            name: 'Scout',
            role: 'editor',
          },
        ],
        initialBlocks: [{ characterId: 77, name: 'Spy' }],
      }),
    );

    expect(markup).toContain('Manage Alpha');
    expect(markup).toContain('Blocked pilots');
    expect(markup).toContain('data-map-blocked-character="77"');
    expect(markup).toContain('Unblock');
    expect(markup).toContain('break-words');
    expect(markup).toContain('min-w-0');
    expect(markup).toContain('data-access-editor-mode="manage"');
    expect(markup).toContain('data-access-grants="42:Scout:editor"');
    expect(markup).toContain('data-character-search');
    expect(markup).toContain('data-has-final-focus="true"');
    expect(markup).toContain('Done');
    expect(markup).not.toContain('Delete map');
    expect(markup).toContain('data-own-character-picker');
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-label="Scout"|aria-label="Scout"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*aria-label="Hauler"|aria-label="Hauler"[^>]*aria-pressed="false"/);
  });

  it('reconciles a refreshed grant snapshot after a concurrent revocation', () => {
    const persistedBefore = [
      {
        ownerType: 'character' as const,
        ownerId: 42,
        name: 'Revoked elsewhere',
        role: 'editor' as const,
      },
      {
        ownerType: 'corporation' as const,
        ownerId: 99,
        name: 'Signal Cartel',
        role: 'viewer' as const,
      },
    ];
    const before = [
      ...persistedBefore,
      {
        ownerType: 'character' as const,
        ownerId: 7,
        name: 'Pending choice',
        role: null,
      },
    ];
    const refreshed = [
      {
        ownerType: 'corporation' as const,
        ownerId: 99,
        name: 'Signal Cartel',
        role: 'admin' as const,
      },
    ];

    expect(mapAccessGrantRevision(persistedBefore)).not.toBe(mapAccessGrantRevision(refreshed));
    expect(reconcileAccessGrantDrafts(refreshed, before)).toEqual([
      refreshed[0],
      before[2],
    ]);
  });
});
