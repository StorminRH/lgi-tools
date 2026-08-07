import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, EdgeProps, NodeProps } from '@xyflow/react';
import type { ChainEdgeData } from '../chain/nodes';
import type { NodeMotion } from '../motion/motion-contract';
import { OutboundArrowContext } from '../tracking/outbound-arrow-context';
import type { OutboundArrow } from '../tracking/pilot-path';
import type { PresencePilot, SystemPresence } from '../tracking/presence-model';
import { ChainLinkEdge, edgeMotionClass, edgePresentation } from './ChainLinkEdge';
import { PresenceBadgeView } from './PilotPresenceBadge';
import { SystemNode, nodeMotionClass, type ChainNode } from './SystemNode';

const { internalNodes } = vi.hoisted(() => ({
  internalNodes: new Map<string, unknown>(),
}));

vi.mock('@xyflow/react', async () => {
  const { createElement: element, Fragment } = await import('react');
  return {
    BaseEdge: () => element('path'),
    EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) =>
      element(Fragment, null, children),
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    useInternalNode: (id: string) => internalNodes.get(id),
  };
});

function markup(motion: NodeMotion | undefined, dragging = false): string {
  const props = {
    data: { name: 'J123456', className: 'C5', motion },
    dragging,
  } as unknown as NodeProps<ChainNode>;
  return renderToStaticMarkup(createElement(SystemNode, props));
}

// ── OW1 — the widget frame carries the header name, disc, and widget slots ───
describe('widget frame markup', () => {
  it('renders the name in the frame header and the class chip in the disc', () => {
    const still = markup(undefined);

    expect(still).toContain('data-chain-node-name');
    expect(still).toContain('J123456');
    expect(still).toContain('data-chain-node-class');
    expect(still).toContain('C5');
    expect(still).toContain('map-node-disc');
  });

  it('renders the widget slot rail along the frame edge', () => {
    expect(markup(undefined)).toContain('data-chain-node-widgets');
  });

  it('renders no presence badge without a provider (context default)', () => {
    expect(markup(undefined)).not.toContain('data-pilot-presence');
  });

  it('omits the class chip when the class is unknown', () => {
    const props = {
      data: { name: 'Jita', className: null },
      dragging: false,
    } as unknown as NodeProps<ChainNode>;
    const rendered = renderToStaticMarkup(createElement(SystemNode, props));

    expect(rendered).not.toContain('data-chain-node-class');
    expect(rendered).toContain('data-chain-node-name');
  });
});

// ── OW3 (4.0.4.2.3) — derived halo systems read visibly provisional ──────────
describe('halo node markup', () => {
  const haloMarkup = (fogged: boolean) => {
    const props = {
      data: { name: 'Perimeter', className: null, halo: { ring: fogged ? 3 : 1, fogged } },
      dragging: false,
    } as unknown as NodeProps<ChainNode>;
    return renderToStaticMarkup(createElement(SystemNode, props));
  };

  it('marks a drawn halo node derived, with the dashed provisional disc', () => {
    const drawn = haloMarkup(false);
    expect(drawn).toContain('data-chain-node-derived');
    expect(drawn).not.toContain('data-chain-node-fogged');
    expect(drawn).toContain('border-dashed');
  });

  it('marks a fogged ring node and hides it under the cloud (OW4)', () => {
    const fogged = haloMarkup(true);
    expect(fogged).toContain('data-chain-node-fogged');
    // The fog canvas paints BELOW the node layer, so the fogged node hides
    // itself; invisibility-under-fog is this class, not paint order (SC-3.2).
    expect(fogged).toContain('opacity-0');
    expect(fogged).not.toContain('opacity-40');
  });

  it('leaves authored nodes unmarked', () => {
    expect(markup(undefined)).not.toMatch(
      /data-chain-node-derived|data-chain-node-fogged|border-dashed/,
    );
  });
});

// ── OW3 — the outbound pilot arrow rides the edge-label seam ─────────────────
describe('outbound arrow markup', () => {
  const frameNode = (x: number, y: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: {},
    width: 120,
    height: 88,
  });
  const edgeProps = {
    id: 'e1',
    source: '1',
    target: '2',
    data: { loop: false },
  } as unknown as EdgeProps<Edge<ChainEdgeData, 'chainLink'>>;

  const renderEdge = (arrows: ReadonlyMap<string, OutboundArrow> | null) => {
    internalNodes.set('1', frameNode(0, 0));
    internalNodes.set('2', frameNode(400, 0));
    const edge = createElement(ChainLinkEdge, edgeProps);
    const rendered = renderToStaticMarkup(
      arrows === null
        ? edge
        : createElement(OutboundArrowContext, { value: arrows }, edge),
    );
    internalNodes.clear();
    return rendered;
  };

  it('mounts the arrow when the context assigns one to this edge', () => {
    const rendered = renderEdge(new Map([['e1', { towardSystemId: 2 }]]));
    expect(rendered).toContain('data-pilot-arrow');
    expect(rendered).toContain('map-pilot-arrow');
  });

  it('mounts nothing without an assignment (the empty default context)', () => {
    expect(renderEdge(null)).not.toContain('data-pilot-arrow');
    expect(renderEdge(new Map([['other-edge', { towardSystemId: 2 }]]))).not.toContain(
      'data-pilot-arrow',
    );
  });
});

// ── SC-1 · DC-1 — the birth window is a class on the inner element ───────────
// ── OW2 — the frame-slot presence indicator ──────────────────────────────────
describe('presence badge markup', () => {
  const pilot = (overrides: Partial<PresencePilot>): PresencePilot => ({
    characterId: 1,
    shipTypeId: null,
    docked: false,
    lastMovementAt: 0,
    state: 'live',
    ownAfk: false,
    ...overrides,
  });
  const badge = (presence: SystemPresence) =>
    renderToStaticMarkup(createElement(PresenceBadgeView, { presence }));

  it('renders the live tone while any pilot feed is fresh', () => {
    const rendered = badge({ pilots: [pilot({ state: 'stale' }), pilot({ characterId: 2 })] });
    expect(rendered).toContain('data-pilot-presence="live"');
  });

  it('dims to the stale tone once every feed is old, staying visibly provisional', () => {
    const rendered = badge({ pilots: [pilot({ state: 'stale' })] });
    expect(rendered).toContain('data-pilot-presence="stale"');
  });

  it('shows a count only when more than one pilot shares the system', () => {
    const one = badge({ pilots: [pilot({})] });
    const two = badge({ pilots: [pilot({}), pilot({ characterId: 2 })] });
    expect(one).not.toContain('data-pilot-presence-count');
    expect(two).toContain('data-pilot-presence-count');
    expect(two).toContain('>2<');
  });
});

describe('node motion markup', () => {
  it('marks an entering node on its inner element only', () => {
    const entering = markup({ phase: 'entering' });

    expect(entering).toContain('map-node-enter');
    expect(entering).toContain('map-node-disc');
  });

  it('marks a departing node with its dialed weight', () => {
    expect(markup({ phase: 'departing' })).toContain('map-node-exit');
    expect(markup({ phase: 'departing', heavy: true })).toContain(
      'map-node-exit-heavy',
    );
  });

  it('renders no motion class at rest', () => {
    const still = markup(undefined);

    expect(still).not.toMatch(/map-node-enter|map-node-exit/);
  });
});

// ── SC-3.2 · HC-2 — a dragging node carries no motion presentation ───────────
describe('drag suppression', () => {
  it('omits every motion class and stamps data-dragging while dragging', () => {
    const dragged = markup({ phase: 'entering' }, true);

    expect(dragged).not.toMatch(/map-node-enter|map-node-exit/);
    expect(dragged).toContain('data-dragging');
  });

  it('decides suppression in the pure helper the component consumes', () => {
    expect(nodeMotionClass({ phase: 'entering' }, true)).toBeNull();
    expect(nodeMotionClass({ phase: 'departing', heavy: true }, true)).toBeNull();
    expect(nodeMotionClass(undefined, false)).toBeNull();
    expect(nodeMotionClass({ phase: 'entering' }, false)).toBe('map-node-enter');
  });
});

// ── PD-4 — edge flavor classes mirror the derived motion exactly ─────────────
describe('edge motion classes', () => {
  it('maps fade and grow phases to their stylesheet classes', () => {
    expect(edgeMotionClass(undefined)).toBeNull();
    expect(
      edgeMotionClass({ phase: 'entering', flavor: 'fade', reverse: false, heavy: false }),
    ).toBe('map-edge-fade-enter');
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'fade', reverse: false, heavy: false }),
    ).toBe('map-edge-fade-exit');
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'fade', reverse: false, heavy: true }),
    ).toBe('map-edge-fade-exit-heavy');
  });

  it('renders grow with pathLength normalization and keeps the loop dash otherwise', () => {
    const grow = edgePresentation({
      loop: false,
      motion: { phase: 'entering', flavor: 'grow', reverse: false, heavy: false },
    });
    expect(grow.pathLength).toBe(1);
    expect(grow.className).toBe('map-edge-grow-enter');

    const loopFade = edgePresentation({
      loop: true,
      motion: { phase: 'departing', flavor: 'fade', reverse: false, heavy: false },
    });
    expect(loopFade.pathLength).toBeUndefined();
    expect(loopFade.className).toContain('stroke-dasharray:6_4');
    expect(loopFade.className).toContain('map-edge-fade-exit');

    const still = edgePresentation({ loop: false });
    expect(still.pathLength).toBeUndefined();
    expect(still.className).toBeUndefined();
  });

  it('styles dying edges with the pulsed red class and leaves active edges alone', () => {
    const dying = edgePresentation({ loop: false, tombstoneState: 'dying' });
    expect(dying.className).toBe('map-edge-dying');

    const active = edgePresentation({ loop: false, tombstoneState: 'active' });
    expect(active.className).toBeUndefined();
  });

  it('maps grow direction through the -rev suffix', () => {
    expect(
      edgeMotionClass({ phase: 'entering', flavor: 'grow', reverse: false, heavy: false }),
    ).toBe('map-edge-grow-enter');
    expect(
      edgeMotionClass({ phase: 'entering', flavor: 'grow', reverse: true, heavy: false }),
    ).toBe('map-edge-grow-enter-rev');
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: false, heavy: false }),
    ).toBe('map-edge-grow-exit');
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: true, heavy: false }),
    ).toBe('map-edge-grow-exit-rev');
  });

  it('carries the heavy collapse weight on grow exits — the slow-tier variants', () => {
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: false, heavy: true }),
    ).toBe('map-edge-grow-exit-heavy');
    expect(
      edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: true, heavy: true }),
    ).toBe('map-edge-grow-exit-heavy-rev');
    // Heavy never touches entries: only departures carry collapse weight.
    expect(
      edgeMotionClass({ phase: 'entering', flavor: 'grow', reverse: false, heavy: true }),
    ).toBe('map-edge-grow-enter');
  });
});
