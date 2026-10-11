import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { dialogProbe } from '@/components/ui/__tests__/static-base-dialog';
import type { TerminalSearchProps } from '@/components/ui/terminal-search';
import type { SystemErr, SystemParams } from '@/components/use-system-search';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const h = vi.hoisted(() => {
  const known = new Map([['J120924', 31_000_001], ['J100001', 31_000_002]]);
  return {
    addConnection: null as (() => void) | null,
    picker: null as TerminalSearchProps<SystemParams, SystemErr> | null,
    parse: (input: string) => {
      const id = known.get(input);
      return id === undefined
        ? { ok: false as const, error: { kind: 'not_found' as const } }
        : { ok: true as const, params: { system: { id, name: input, security: null } } };
    },
  };
});

// Keep the menu's state between static renders so its handlers drive the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
}));
vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});
// The node menu hands its item's handler to the test to press.
vi.mock('@/components/ui/pointer-menu', () => ({
  PointerMenu: ({ children }: { children?: ReactNode }) => children,
  MenuItem: ({ children, onClick }: { children?: ReactNode; onClick: () => void }) => {
    if (children === 'Add connection…') h.addConnection = onClick;
    return null;
  },
  menuRow: '',
}));
vi.mock('@/components/ui/terminal-search', () => ({
  TerminalSearch: (props: TerminalSearchProps<SystemParams, SystemErr>) => {
    h.picker = props;
    return null;
  },
}));
vi.mock('@/components/use-system-search', () => ({
  useSystemSearch: () => ({ systems: [], parse: h.parse, suggest: async () => [] }),
}));

import { NodeAddMenu } from './NodeAddMenu';

test('the add-connection dialog names its close button and draws the close mark as an icon', () => {
  rt.unmount();
  const html = rt.render(
    renderToStaticMarkup,
    createElement(NodeAddMenu, { mapId: 'map-a', menu: null, onMenuOpenChange: vi.fn(), onAdd: vi.fn() }),
  );
  expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*">Add connection<\/h2><button type="button" aria-label="Close add connection"><svg aria-hidden="true"/);
});

test('adding a connection from a node reads the node\'s own system as no match and adds the system picked', () => {
  rt.unmount();
  const onAdd = vi.fn();
  const render = () =>
    rt.render(
      renderToStaticMarkup,
      createElement(NodeAddMenu, {
        mapId: 'map-a',
        menu: { systemId: 31_000_001, clientX: 40, clientY: 60 },
        onMenuOpenChange: vi.fn(),
        onAdd,
      }),
    );
  render();
  expect(dialogProbe.root?.open).toBe(false);

  h.addConnection?.();
  render();
  expect(dialogProbe.root?.open).toBe(true);
  const picker = h.picker;
  if (picker === null) throw new Error('the add-connection picker did not render');

  // The server refuses a connection from a system to itself, so the picker never submits one.
  expect(picker.parse('J120924')).toEqual({ ok: false, error: { kind: 'not_found' } });
  const other = picker.parse('J100001');
  expect(other.ok).toBe(true);
  picker.onSubmit((other as { params: SystemParams }).params, 'J100001');
  expect(onAdd.mock.calls).toEqual([[31_000_001, 31_000_002]]);

  render();
  expect(dialogProbe.root?.open).toBe(false);
});
