import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { deleteMapEndpoint } from '@/data/maps/api-contract';
import { settle } from '@/lib/__tests__/hook-runtime';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consequence: ReactNode;
  busy: boolean;
  error?: ReactNode;
  onConfirm: () => void;
}

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const ui = vi.hoisted(() => ({
  presses: new Map<string, (event: { currentTarget: unknown }) => void>(),
  confirm: null as ConfirmProps | null,
}));
const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));

// Keep the catalogue's state between static renders so its handlers drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
  useReducer: rt.react.useReducer,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/atlas',
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children }: { children?: ReactNode }) => createElement('a', null, children),
}));
vi.mock('@/transport/api-client', () => api);
vi.mock('@/components/eve-image', () => ({ EveImage: () => null }));
vi.mock('./MapLifecycleDialogs', () => ({ MapLifecycleDialogs: () => null }));
// Each named button and the delete confirmation hand their handlers to the test to press.
vi.mock('@/components/ui/button', () => ({
  Button: (props: { 'aria-label'?: string; onClick?: (event: { currentTarget: unknown }) => void }) => {
    if (props['aria-label'] && props.onClick) ui.presses.set(props['aria-label'], props.onClick);
    return null;
  },
}));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: ConfirmProps) => {
    ui.confirm = props;
    return null;
  },
}));

import { MapCatalogue } from './MapCatalogue';
import { MapCatalogueDataProvider } from './map-catalogue-data';

test('a refused delete keeps its error to that attempt, and a deleted map stays named while its confirmation closes', async () => {
  const render = () =>
    rt.render(
      renderToStaticMarkup,
      createElement(
        MapCatalogueDataProvider,
        {
          maps: [
            {
              id: 'map-home',
              name: 'Home Chain',
              createdAt: new Date('2026-08-12T12:00:00.000Z'),
              creatorName: 'Mapper',
              role: 'admin',
              provenance: { kind: 'created' },
            },
          ],
          deletedMaps: [],
          corporations: [],
          grantsByMapId: {},
          blocksByMapId: {},
          listingAvailable: true,
        },
        createElement(MapCatalogue),
      ),
    );
  const pressDelete = () => ui.presses.get('Delete Home Chain')?.({ currentTarget: null });
  render();
  pressDelete();
  render();
  expect(ui.confirm).toMatchObject({
    open: true,
    consequence: expect.stringMatching(/^Home Chain leaves the catalogue/),
    error: null,
  });

  api.apiFetch.mockResolvedValueOnce({ ok: false });
  ui.confirm?.onConfirm();
  render();
  expect(ui.confirm).toMatchObject({ open: true, busy: true });
  await settle();
  render();
  expect(api.apiFetch).toHaveBeenCalledExactlyOnceWith(deleteMapEndpoint, expect.objectContaining({ body: { mapId: 'map-home' } }));
  expect(ui.confirm).toMatchObject({ open: true, busy: false, error: expect.any(String) });

  // Closing and asking again starts clean: the refusal belonged to the last attempt.
  ui.confirm?.onOpenChange(false);
  render();
  expect(ui.confirm).toMatchObject({ open: false });
  pressDelete();
  render();
  expect(ui.confirm).toMatchObject({ open: true, error: null });

  api.apiFetch.mockResolvedValueOnce({ ok: true });
  ui.confirm?.onConfirm();
  await settle();
  render();
  expect(nav.refresh).toHaveBeenCalledOnce();
  expect(ui.confirm).toMatchObject({
    open: false,
    busy: false,
    consequence: expect.stringMatching(/^Home Chain leaves the catalogue/),
  });
});
