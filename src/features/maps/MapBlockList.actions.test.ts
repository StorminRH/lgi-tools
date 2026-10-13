import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { dialogProbe } from '@/components/ui/__tests__/static-base-dialog';
import type { AccessPrincipalOption } from './access-editor-model';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const ui = vi.hoisted(() => ({
  pick: null as ((principal: AccessPrincipalOption) => void) | null,
  presses: new Map<string, () => void>(),
}));

// Keep the list's state between static renders so its handlers drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
  useReducer: rt.react.useReducer,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The static dialog keeps a closed popup's body in the markup, as Base UI does through its exit transition.
vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});
vi.mock('./CharacterSearchControl', () => ({
  CharacterSearchControl: ({ onSelect }: { onSelect: (principal: AccessPrincipalOption) => void }) => {
    ui.pick = onSelect;
    return null;
  },
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    if (typeof children === 'string' && onClick) ui.presses.set(children, onClick);
    return null;
  },
}));

import { MapBlockList } from './MapBlockList';

test('a picked pilot is blocked only once confirmed, and the closing dialog still names them', () => {
  const editor = { blocks: [], busy: false, error: null, block: vi.fn(async () => {}), unblock: vi.fn(async () => {}) };
  const render = () => rt.render(renderToStaticMarkup, createElement(MapBlockList, { editor, disabled: false }));
  const consequence = 'Blocking removes Pilot One and every other character on their LGI.tools account from this map.';

  let html = render();
  expect(dialogProbe.root?.open).toBe(false);
  expect(html).not.toContain(consequence);

  ui.pick?.({ ownerType: 'character', ownerId: 90000001, name: 'Pilot One' });
  html = render();
  expect(dialogProbe.root?.open).toBe(true);
  expect(html).toContain(consequence);
  expect(editor.block).not.toHaveBeenCalled();

  ui.presses.get('Block')?.();
  html = render();
  expect(editor.block).toHaveBeenCalledExactlyOnceWith({ characterId: 90000001, name: 'Pilot One' });
  expect(dialogProbe.root?.open).toBe(false);
  expect(html).toContain(consequence);
});
