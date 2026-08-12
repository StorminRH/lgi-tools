import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('map=map-a'),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
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
  DialogClose: ({ children }: { children: React.ReactNode }) =>
    createElement('button', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    createElement('p', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    createElement('h2', null, children),
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
      }),
    );

    expect(markup).toContain('Manage Alpha');
    expect(markup).toContain('data-access-editor-mode="manage"');
    expect(markup).toContain('data-access-grants="42:Scout:editor"');
    expect(markup).toContain('data-character-search');
    expect(markup).toContain('data-has-final-focus="true"');
    expect(markup).toContain('Delete map');
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
