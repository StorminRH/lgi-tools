import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { dialogProbe } from '@/components/ui/__tests__/static-base-dialog';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const ui = vi.hoisted(() => ({ presses: new Map<string, () => void>() }));

// Keep the editor's state between static renders so its handlers drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
  useReducer: rt.react.useReducer,
}));
// The static dialog keeps a closed popup's body in the markup, as Base UI does through its exit transition.
vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => {
    if (typeof children === 'string' && onClick) ui.presses.set(children, onClick);
    return null;
  },
}));

import { AccessListEditor } from './AccessListEditor';

test('revoking asks first, removes the grant on confirm, and the closing dialog still names the pilot', () => {
  const grant = { ownerType: 'character' as const, ownerId: 42, name: 'Scout', role: 'viewer' as const };
  const onPrincipalRemove = vi.fn();
  const render = () =>
    rt.render(
      renderToStaticMarkup,
      createElement(AccessListEditor, {
        mode: 'manage',
        corporations: [],
        currentGrants: [grant],
        onPrincipalAdd: vi.fn(),
        onRoleChange: vi.fn(),
        onPrincipalRemove,
      }),
    );
  const consequence = 'Scout will lose this delegated map role after the access projection updates.';

  let html = render();
  expect(dialogProbe.root?.open).toBe(false);
  expect(html).not.toContain(consequence);

  ui.presses.get('Revoke')?.();
  html = render();
  expect(dialogProbe.root?.open).toBe(true);
  expect(html).toContain(consequence);
  expect(onPrincipalRemove).not.toHaveBeenCalled();

  ui.presses.get('Revoke access')?.();
  html = render();
  expect(onPrincipalRemove).toHaveBeenCalledExactlyOnceWith(grant);
  expect(dialogProbe.root?.open).toBe(false);
  expect(html).toContain(consequence);

  // A second click on the fading dialog's confirm button revokes nothing more.
  ui.presses.get('Revoke access')?.();
  expect(onPrincipalRemove).toHaveBeenCalledOnce();
});
