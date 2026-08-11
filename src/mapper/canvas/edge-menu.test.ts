import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { EdgeContextMenu } from './EdgeContextMenu';
import {
  edgeMenuActions,
  edgeMenuConnectionId,
  type EdgeMenuAnchor,
} from './edge-menu';

const announce = vi.hoisted(() => vi.fn());
vi.mock('../authoring/sever-toast', () => ({
  announceSeverOutcome: announce,
}));
vi.mock('../jump-client', () => ({ postJumpRequest: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/components/ui/pointer-menu', () => ({
  PointerMenu: (props: {
    open: boolean;
    anchor: unknown;
    label: string;
    children?: unknown;
  }) =>
    createElement(
      'div',
      {
        'data-pointer-menu': props.label,
        'data-open': props.open ? 'true' : 'false',
        'data-anchored': props.anchor === null ? 'false' : 'true',
      },
      props.children as never,
    ),
  MenuItem: ({
    children,
    onClick: _onClick,
    className: _className,
  }: {
    children?: unknown;
    onClick?: () => void;
    className?: string;
  }) => createElement('div', { role: 'menuitem' }, children as never),
  menuRow: '',
}));

vi.mock('@/components/ui/overlay-positioning', () => ({
  pointerAnchor: (x: number, y: number) => ({ x, y }),
}));

const CONNECTION_ID = 'c1' as Id<'mapConnections'>;

describe('edgeMenuConnectionId', () => {
  it('names the connection document an authored line stands for', () => {
    expect(
      edgeMenuConnectionId({ edgeId: 'c1', stub: false, canEdit: true }),
    ).toBe('c1');
  });

  it('withholds the menu from viewers', () => {
    expect(
      edgeMenuConnectionId({ edgeId: 'c1', stub: false, canEdit: false }),
    ).toBeNull();
  });

  it('withholds the menu from derived halo links and unresolved stubs', () => {
    expect(
      edgeMenuConnectionId({ edgeId: 'halo:1:2', stub: false, canEdit: true }),
    ).toBeNull();
    expect(
      edgeMenuConnectionId({ edgeId: 'c1', stub: true, canEdit: true }),
    ).toBeNull();
  });
});

describe('EdgeContextMenu', () => {
  const menu: EdgeMenuAnchor = {
    connectionId: CONNECTION_ID,
    clientX: 40,
    clientY: 90,
  };

  it('offers exactly Edit and Delete at the pointer', () => {
    const markup = renderToStaticMarkup(
      createElement(EdgeContextMenu, {
        menu,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onOpenChange: vi.fn(),
      }),
    );
    expect(markup).toContain('data-pointer-menu="Connection actions"');
    expect(markup).toContain('data-open="true"');
    expect(markup).toContain('data-anchored="true"');
    expect(markup).toContain('>Edit<');
    expect(markup).toContain('>Delete<');
    expect(markup.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it('stays closed and unanchored with nothing right-clicked', () => {
    const markup = renderToStaticMarkup(
      createElement(EdgeContextMenu, {
        menu: null,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onOpenChange: vi.fn(),
      }),
    );
    expect(markup).toContain('data-open="false"');
    expect(markup).toContain('data-anchored="false"');
  });
});

describe('edgeMenuActions', () => {
  function authoring() {
    return {
      setConnectionWormholeType: vi.fn(),
      setConnectionShipSize: vi.fn(),
      setConnectionMassState: vi.fn(),
      setConnectionLifeStage: vi.fn(),
      setConnectionDestinationHint: vi.fn(),
      severConnection: vi.fn(
        async (): Promise<{ outcome: 'retained' }> => ({ outcome: 'retained' }),
      ),
      restoreSeveredBranch: vi.fn(),
      restoreConnection: vi.fn(),
      restoreSignatures: vi.fn(),
    };
  }

  const menu: EdgeMenuAnchor = {
    connectionId: CONNECTION_ID,
    clientX: 1,
    clientY: 2,
  };

  it('opens the one Signature Editor on Edit', () => {
    const openEditor = vi.fn();
    const closeMenu = vi.fn();
    edgeMenuActions({
      mapId: 'map-a',
      authoring: authoring(),
      openEditor,
      closeEditor: vi.fn(),
      closeMenu,
    }).onEdit(menu);
    expect(closeMenu).toHaveBeenCalledOnce();
    expect(openEditor).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it('severs through the shipped undo pathway on Delete', async () => {
    announce.mockClear();
    const api = authoring();
    const closeEditor = vi.fn();
    edgeMenuActions({
      mapId: 'map-a',
      authoring: api,
      openEditor: vi.fn(),
      closeEditor,
      closeMenu: vi.fn(),
    }).onDelete(menu);
    await vi.waitFor(() => expect(announce).toHaveBeenCalledOnce());
    expect(api.severConnection).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION_ID,
    });
    expect(closeEditor).toHaveBeenCalledOnce();

    // The announced undo is the shipped branch restore, not a second rule.
    const call = announce.mock.calls[0]?.[0] as { onUndo: () => void };
    call.onUndo();
    expect(api.restoreSeveredBranch).toHaveBeenCalledWith({
      mapId: 'map-a',
      connectionId: CONNECTION_ID,
    });
  });
});
