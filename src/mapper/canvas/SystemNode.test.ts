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

test('widget frame carries header, disc, slots, and pointer-inert chrome rules', () => {
  const still = markup(undefined);
  expect(still).toContain('data-chain-node-name');
  expect(still).toContain('J123456');
  expect(still).toContain('data-chain-node-class');
  expect(still).toContain('C5');
  expect(still).toContain('map-node-disc');
  expect(still).toContain('data-chain-node-widgets');
  expect(still).not.toContain('data-pilot-presence');
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
});
