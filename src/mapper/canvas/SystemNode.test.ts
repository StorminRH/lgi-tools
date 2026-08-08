import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, EdgeProps, NodeProps } from '@xyflow/react';
import type { ChainEdgeData } from '../chain/nodes';
import type { NodeMotion } from '../motion/motion-contract';
import { OutboundArrowContext } from '../tracking/outbound-arrow-context';
import type { OutboundArrow } from '../tracking/pilot-path';
import type { PresencePilot, SystemPresence } from '../tracking/presence-model';
import {
  ChainLinkEdge,
  edgeMotionClass,
  edgePresentation,
  outboundArrowFraction,
} from './ChainLinkEdge';
import { FOG_EDGE_CUT_FRACTION } from '../fog/fog-model';
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

  it('re-enables pointer events on the interactive chrome only', () => {
    // The wrapper is pointer-inert (INERT_NODE_STYLE on every node object);
    // the name and disc opt back in, so the invisible frame margin cannot
    // catch clicks, drags, or hovers. Two occurrences: header + disc.
    const still = markup(undefined);
    expect(still.match(/pointer-events-auto/g)).toHaveLength(2);
  });

  it('keeps ghost chrome inert — a departing node must not regain pointer events', () => {
    expect(markup({ phase: 'departing' })).not.toContain('pointer-events-auto');
    // An ENTERING node is live truth and stays interactive from first paint.
    expect(markup({ phase: 'entering' }).match(/pointer-events-auto/g)).toHaveLength(2);
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
    // Fully inert under the cloud: no chrome opts back into pointer events.
    expect(fogged).not.toContain('pointer-events-auto');
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

  it('mounts the arrow when the context assigns one to this edge, toned by liveness', () => {
    const liveArrow = renderEdge(new Map([['e1', { towardSystemId: 2, live: true }]]));
    expect(liveArrow).toContain('data-pilot-arrow');
    expect(liveArrow).toContain('map-pilot-arrow');
    expect(liveArrow).toContain('text-isk');
    // Staleness honesty on the arrow: a stale-only claimant mutes the glyph.
    const staleArrow = renderEdge(new Map([['e1', { towardSystemId: 2, live: false }]]));
    expect(staleArrow).toContain('data-pilot-arrow');
    expect(staleArrow).toContain('text-muted');
    expect(staleArrow).not.toContain('text-isk');
  });

  it('mounts nothing without an assignment (the empty default context)', () => {
    expect(renderEdge(null)).not.toContain('data-pilot-arrow');
    expect(
      renderEdge(new Map([['other-edge', { towardSystemId: 2, live: true }]])),
    ).not.toContain('data-pilot-arrow');
  });

  it('keeps the arrow inside the drawn span of a fog-truncated edge', () => {
    // Every mounted edge is drawn↔fogged, and the stub draws exactly
    // FOG_EDGE_CUT_FRACTION of the segment from the non-fogged end — the
    // arrow's fraction must sit strictly inside that span, derived from the
    // SAME constant, so retuning the cut can never strand the glyph in the
    // cloud past the end of its own line.
    expect(outboundArrowFraction('source')).toBeLessThan(FOG_EDGE_CUT_FRACTION);
    expect(outboundArrowFraction('target')).toBeLessThan(FOG_EDGE_CUT_FRACTION);
    expect(outboundArrowFraction('source')).toBeGreaterThan(0);
    expect(outboundArrowFraction(undefined)).toBe(0.7);
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
    expect(rendered).toContain('text-isk');
    expect(rendered).toContain('<svg');
  });

  it('dims to the stale tone once every feed is old, staying visibly provisional', () => {
    const rendered = badge({ pilots: [pilot({ state: 'stale' })] });
    expect(rendered).toContain('data-pilot-presence="stale"');
    expect(rendered).toContain('text-muted');
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
