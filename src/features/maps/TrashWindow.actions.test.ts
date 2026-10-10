import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { purgeMapNowEndpoint } from '@/data/maps/api-contract';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import { settle } from '@/lib/__tests__/hook-runtime';

interface ConfirmProps {
  open: boolean;
  consequence: ReactNode;
  error?: ReactNode;
  onConfirm: () => void;
}

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const ui = vi.hoisted(() => ({
  checks: new Map<string, (checked: boolean) => void>(),
  presses: new Map<string, () => void>(),
  confirm: null as ConfirmProps | null,
}));
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));

// Keep the window's state between static renders so its handlers drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
  useReducer: rt.react.useReducer,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/transport/api-client', () => api);
vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});
// Each row, button and the confirmation hand their handlers to the test to press.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ label, onCheckedChange }: { label: string; onCheckedChange: (checked: boolean) => void }) => {
    ui.checks.set(label, onCheckedChange);
    return null;
  },
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    if (typeof children === 'string' && onClick) ui.presses.set(children, onClick);
    return null;
  },
}));
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: (props: ConfirmProps) => {
    ui.confirm = props;
    return null;
  },
}));

import { TrashWindow } from './TrashWindow';

function createdMap(id: string, name: string): DeletedRestorableMapRow {
  return {
    id,
    name,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    archivedAt: new Date('2026-08-12T00:00:00.000Z'),
    creatorName: 'Mapper',
    role: 'admin',
    provenance: { kind: 'created' },
  };
}

test('the purge confirmation counts the maps it was opened for, through a refused map and while it closes', async () => {
  const maps = [createdMap('home', 'Home Chain'), createdMap('scratch', 'Scratch Chain')];
  const render = () =>
    rt.render(renderToStaticMarkup, createElement(TrashWindow, { open: true, onOpenChange: vi.fn(), maps }));
  render();
  ui.checks.get('Home Chain')?.(true);
  ui.checks.get('Scratch Chain')?.(true);
  render();
  ui.presses.get('Permanently delete')?.();
  render();
  expect(ui.confirm).toMatchObject({
    open: true,
    consequence: expect.stringMatching(/^2 selected maps will enter/),
  });

  // The second map is refused: the dialog stays open on the map still to purge.
  api.apiFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
  ui.confirm?.onConfirm();
  await settle();
  render();
  expect(api.apiFetch.mock.calls.map(([endpoint, init]) => [endpoint, init.body])).toEqual([
    [purgeMapNowEndpoint, { mapId: 'home' }],
    [purgeMapNowEndpoint, { mapId: 'scratch' }],
  ]);
  expect(ui.confirm).toMatchObject({
    open: true,
    consequence: expect.stringMatching(/^1 selected map will enter/),
    error: expect.any(String),
  });

  // The retry purges only that map, and the closing dialog still counts it.
  api.apiFetch.mockClear().mockResolvedValueOnce({ ok: true });
  ui.confirm?.onConfirm();
  await settle();
  render();
  expect(api.apiFetch).toHaveBeenCalledExactlyOnceWith(purgeMapNowEndpoint, expect.objectContaining({ body: { mapId: 'scratch' } }));
  expect(ui.confirm).toMatchObject({
    open: false,
    consequence: expect.stringMatching(/^1 selected map will enter/),
  });
});
