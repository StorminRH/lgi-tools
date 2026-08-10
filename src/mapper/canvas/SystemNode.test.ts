import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
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
import { systemIdentityReadout } from '@/data/eve-data/system-identity';
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
    data: { name: 'J123456', className: 'C5', security: -1, whClassId: 5, motion },
    dragging,
  } as unknown as NodeProps<ChainNode>;
  return renderToStaticMarkup(createElement(SystemNode, props));
}

test('widget frame carries header, disc, slots, and pointer-inert chrome rules', () => {
  const still = markup(undefined);
  expect(still).toContain('data-chain-node-name');
  // The class fact renders once, in the header readout — never as a system
  // disc chip (D-E).
  expect(still).toContain('J123456 - C5');
  expect(still).not.toContain('data-chain-node-class');
  expect(still).toContain('map-node-disc');
  expect(still).toContain('data-chain-node-widgets');
  expect(still).not.toContain('data-pilot-presence');
  // Two occurrences: header + disc.
  expect(still.match(/pointer-events-auto/g)).toHaveLength(2);

  const noClass = renderToStaticMarkup(
    createElement(SystemNode, {
      data: { name: 'Jita', className: null },
      dragging: false,
    } as unknown as NodeProps<ChainNode>),
  );
  expect(noClass).not.toContain('data-chain-node-class');
  expect(noClass).toContain('data-chain-node-name');

  expect(markup({ phase: 'departing' })).not.toContain('pointer-events-auto');
  expect(markup({ phase: 'entering' }).match(/pointer-events-auto/g)).toHaveLength(2);
});

test('the header renders the shared identity readout in its tone (D-E)', () => {
  const nodeMarkup = (data: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SystemNode, {
        data,
        dragging: false,
      } as unknown as NodeProps<ChainNode>),
    );

  // J-space and k-space both render the helper's exact label and tone — the
  // node header IS the shared rule's output, not a second formatting path.
  const jspace = systemIdentityReadout({ name: 'J123456', security: -1, whClassId: 4 });
  const jspaceNode = nodeMarkup({
    name: 'J123456',
    className: 'C4',
    security: -1,
    whClassId: 4,
  });
  expect(jspace).toEqual({ label: 'J123456 - C4', tone: 'text-wh-c4' });
  expect(jspaceNode).toContain(jspace.label);
  expect(jspaceNode).toContain(jspace.tone);

  const kspace = systemIdentityReadout({ name: 'Jita', security: 0.946, whClassId: null });
  const kspaceNode = nodeMarkup({
    name: 'Jita',
    className: null,
    security: 0.946,
    whClassId: null,
  });
  expect(kspace).toEqual({ label: 'Jita - 0.9', tone: 'text-sec-09' });
  expect(kspaceNode).toContain(kspace.label);
  expect(kspaceNode).toContain(kspace.tone);

  // A derived halo system keeps the muted ghost header: readout label, no tone.
  const halo = nodeMarkup({
    name: 'Perimeter',
    className: null,
    security: 0.9,
    whClassId: null,
    halo: { ring: 1, fogged: false },
  });
  expect(halo).toContain('Perimeter - 0.9');
  expect(halo).toContain('text-muted');
  expect(halo).not.toContain('text-sec-09');

  // A stub is a signature, not a system — its header stays the bare sig id,
  // and the disc chip survives only here, carrying the typed wormhole code.
  const stub = nodeMarkup({
    name: 'ABC-123',
    className: 'K162',
    stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
  });
  expect(stub).toContain('ABC-123');
  expect(stub).not.toContain('ABC-123 - ');
  expect(stub).toContain('data-chain-node-class');
  expect(stub).toContain('K162');
});

test('halo nodes mark drawn vs fogged; authored nodes stay unmarked', () => {
  const haloMarkup = (fogged: boolean) => {
    const props = {
      data: { name: 'Perimeter', className: null, halo: { ring: fogged ? 3 : 1, fogged } },
      dragging: false,
    } as unknown as NodeProps<ChainNode>;
    return renderToStaticMarkup(createElement(SystemNode, props));
  };

  const drawn = haloMarkup(false);
  expect(drawn).toContain('data-chain-node-derived');
  expect(drawn).not.toContain('data-chain-node-fogged');
  expect(drawn).toContain('border-dashed');

  const fogged = haloMarkup(true);
  expect(fogged).toContain('data-chain-node-fogged');
  expect(fogged).toContain('opacity-0');
  expect(fogged).not.toContain('opacity-40');
  expect(fogged).toContain('aria-hidden="true"');
  expect(fogged).not.toContain('pointer-events-auto');

  const authored = markup(undefined);
  expect(authored).not.toContain('aria-hidden');
  expect(authored).not.toMatch(/data-chain-node-derived|data-chain-node-fogged|border-dashed/);
});

test('wormhole stubs reuse the derived ghost presentation without interactive chrome', () => {
  const props = {
    id: 'stub:c1',
    data: {
      name: 'ABC-123',
      className: null,
      stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
    },
    dragging: false,
    isConnectable: false,
  } as unknown as NodeProps<ChainNode>;
  const rendered = renderToStaticMarkup(createElement(SystemNode, props));

  expect(rendered).toContain('data-chain-node-stub');
  expect(rendered).toContain('data-chain-node-derived');
  expect(rendered).toContain('ABC-123');
  expect(rendered).toContain('border-dashed');
  expect(rendered).toContain('opacity-75');
  expect(rendered).not.toContain('pointer-events-auto');
  expect(rendered).not.toContain('data-pilot-presence');
});

test('static stubs render the exact code-class label through the same inert ghost chrome', () => {
  const props = {
    id: 'static-stub:31000001:C247:1',
    data: {
      name: 'C247 - C3',
      className: 'C247',
      stub: {
        staticId: '31000001:C247:1',
        fromSystemId: 31_000_001,
        code: 'C247',
        className: 'C3',
      },
    },
    dragging: false,
    isConnectable: false,
  } as unknown as NodeProps<ChainNode>;
  const rendered = renderToStaticMarkup(createElement(SystemNode, props));

  expect(rendered).toContain('data-chain-node-static-stub');
  expect(rendered).toContain('C247 - C3');
  expect(rendered).toContain('>C247<');
  expect(rendered).toContain('border-dashed');
  expect(rendered).not.toContain('pointer-events-auto');
  expect(rendered).not.toContain('data-pilot-presence');
});

test('outbound arrow mounts by assignment, tones by liveness, and stays inside fog cut', () => {
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

  const liveArrow = renderEdge(new Map([['e1', { towardSystemId: 2, live: true }]]));
  expect(liveArrow).toContain('data-pilot-arrow');
  expect(liveArrow).toContain('map-pilot-arrow');
  expect(liveArrow).toContain('text-isk');

  const staleArrow = renderEdge(new Map([['e1', { towardSystemId: 2, live: false }]]));
  expect(staleArrow).toContain('data-pilot-arrow');
  expect(staleArrow).toContain('text-muted');
  expect(staleArrow).not.toContain('text-isk');

  expect(renderEdge(null)).not.toContain('data-pilot-arrow');
  expect(
    renderEdge(new Map([['other-edge', { towardSystemId: 2, live: true }]])),
  ).not.toContain('data-pilot-arrow');

  // The stub draws exactly FOG_EDGE_CUT_FRACTION of a fog-truncated segment from
  // the non-fogged end — the arrow's fraction must sit strictly inside that span,
  // derived from the SAME constant, so retuning the cut can never strand the
  // glyph in the cloud past the end of its own line.
  expect(outboundArrowFraction('source')).toBeLessThan(FOG_EDGE_CUT_FRACTION);
  expect(outboundArrowFraction('target')).toBeLessThan(FOG_EDGE_CUT_FRACTION);
  expect(outboundArrowFraction('source')).toBeGreaterThan(0);
  expect(outboundArrowFraction(undefined)).toBe(0.7);
});

test('presence badge tones, counts, motion markup, and drag suppression', () => {
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

  const live = badge({ pilots: [pilot({ state: 'stale' }), pilot({ characterId: 2 })] });
  expect(live).toContain('data-pilot-presence="live"');
  expect(live).toContain('text-isk');
  expect(live).toContain('<svg');

  const stale = badge({ pilots: [pilot({ state: 'stale' })] });
  expect(stale).toContain('data-pilot-presence="stale"');
  expect(stale).toContain('text-muted');

  const one = badge({ pilots: [pilot({})] });
  const two = badge({ pilots: [pilot({}), pilot({ characterId: 2 })] });
  expect(one).not.toContain('data-pilot-presence-count');
  expect(two).toContain('data-pilot-presence-count');
  expect(two).toContain('>2<');

  const entering = markup({ phase: 'entering' });
  expect(entering).toContain('map-node-enter');
  expect(entering).toContain('map-node-disc');
  expect(markup({ phase: 'departing' })).toContain('map-node-exit');
  expect(markup({ phase: 'departing', heavy: true })).toContain('map-node-exit-heavy');
  expect(markup(undefined)).not.toMatch(/map-node-enter|map-node-exit/);

  const dragged = markup({ phase: 'entering' }, true);
  expect(dragged).not.toMatch(/map-node-enter|map-node-exit/);
  expect(dragged).toContain('data-dragging');
  expect(nodeMotionClass({ phase: 'entering' }, true)).toBeNull();
  expect(nodeMotionClass({ phase: 'departing', heavy: true }, true)).toBeNull();
  expect(nodeMotionClass(undefined, false)).toBeNull();
  expect(nodeMotionClass({ phase: 'entering' }, false)).toBe('map-node-enter');
});

test('edge motion classes map fade/grow/rev/heavy/dying and loop dash', () => {
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
  expect(
    edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: false, heavy: true }),
  ).toBe('map-edge-grow-exit-heavy');
  expect(
    edgeMotionClass({ phase: 'departing', flavor: 'grow', reverse: true, heavy: true }),
  ).toBe('map-edge-grow-exit-heavy-rev');
  expect(
    edgeMotionClass({ phase: 'entering', flavor: 'grow', reverse: false, heavy: true }),
  ).toBe('map-edge-grow-enter');

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

  expect(edgePresentation({ loop: false }).pathLength).toBeUndefined();
  expect(edgePresentation({ loop: false }).className).toBeUndefined();
  expect(edgePresentation({ loop: false, tombstoneState: 'dying' }).className).toBe(
    'map-edge-dying',
  );
  expect(edgePresentation({ loop: false, tombstoneState: 'active' }).className).toBeUndefined();
  expect(edgePresentation({ loop: false, stub: true }).className).toBe('map-edge-derived');
});
