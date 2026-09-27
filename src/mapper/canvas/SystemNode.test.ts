import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { Edge, EdgeProps, NodeProps } from '@xyflow/react';
import type { ChainEdgeData } from '../chain/nodes';
import type { NodeMotion } from '../motion/motion-contract';
import { OutboundArrowContext } from '../tracking/outbound-arrow-context';
import type { OutboundArrow } from '../tracking/pilot-path';
import type { DiscBody } from './wormhole/palette';
import {
  CHAIN_EDGE_INTERACTION_WIDTH,
  ChainLinkEdge,
  edgeMotionClass,
  edgePresentation,
  outboundArrowFraction,
} from './ChainLinkEdge';
import { FOG_EDGE_CUT_FRACTION } from '../fog/fog-model';
import { PresenceBadgeView } from './PilotPresenceBadge';
import {
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  SystemNode,
  chipFontSizePx,
  nodeMotionClass,
  type ChainNode,
} from './SystemNode';

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

vi.mock('./wormhole/WormholeVisual', async () => {
  const { createElement: element } = await import('react');
  return {
    WormholeVisual: ({ body, active, paused }: {
      body: DiscBody;
      active: boolean;
      paused: boolean;
    }) => element('span', {
      'data-wormhole-visual': body.kind === 'wormhole' ? body.classId ?? 'unknown' : body.security,
      'data-body': body.kind,
      'data-effect': body.kind === 'wormhole' ? body.effect ?? undefined : undefined,
      'data-visual-active': String(active),
      'data-visual-paused': String(paused),
    }),
  };
});

test('wormhole classes mount the decorative visual and pause it while inert', () => {
  const renderNode = (
    props: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => renderToStaticMarkup(createElement(SystemNode, {
    id: '31000001',
    ...props,
    data: { name: 'J123456', className: null, ...data },
  } as unknown as NodeProps<ChainNode>));

  const c6 = renderNode({}, { whClassId: 6 });
  expect(c6).toContain('data-wormhole-visual="6"');
  expect(c6).toContain('map-node-disc-wormhole');
  expect(c6).toContain('data-visual-active="false"');
  expect(c6).toContain('data-visual-paused="false"');
  expect(c6).not.toContain('data-chain-node-selected');
  expect(c6.match(/data-handle=/g)).toHaveLength(2);
  expect(renderNode({}, { whClassId: 12 })).toContain('data-wormhole-visual="12"');

  const effect = renderNode({}, { whClassId: 4, effect: 'black-hole' });
  expect(effect).toContain('data-body="wormhole"');
  expect(effect).toContain('data-effect="black-hole"');

  for (const whClassId of [7, null]) {
    const kspace = renderNode({}, { whClassId, name: 'System', security: 0.43 });
    expect(kspace).toContain('data-wormhole-visual="0.43"');
    expect(kspace).toContain('data-body="planet"');
    expect(kspace).toContain('map-node-disc-planet');
    expect(kspace).not.toContain('map-node-disc-wormhole');
    expect(kspace).toContain('--kspace-caption-transform');

    const unresolved = renderNode({}, { whClassId, name: 'System' });
    expect(unresolved).not.toContain('data-wormhole-visual');
    expect(unresolved).not.toContain('map-node-disc-planet');
  }

  const haloPlanet = renderNode({}, { name: 'Perimeter', security: 0.9, halo: { ring: 1, fogged: false } });
  expect(haloPlanet).toContain('data-body="planet"');

  const selected = renderNode({ selected: true }, { whClassId: 3, className: 'C3' });
  expect(selected).toContain('data-visual-active="true"');
  expect(selected).toContain('data-visual-paused="false"');
  expect(selected).toContain('data-chain-node-selected');

  const dragging = renderNode({ selected: true, dragging: true }, { whClassId: 3, className: 'C3' });
  expect(dragging).toContain('data-visual-active="true"');
  expect(dragging).toContain('data-visual-paused="true"');
  const departing = renderNode(
    { selected: true },
    { whClassId: 3, className: 'C3', motion: { phase: 'departing' } },
  );
  expect(departing).toContain('data-visual-active="true"');
  expect(departing).toContain('data-visual-paused="true"');
  const fogged = renderNode(
    { selected: true },
    { whClassId: 3, className: 'C3', halo: { ring: 3, fogged: true } },
  );
  expect(fogged).toContain('data-visual-active="true"');
  expect(fogged).toContain('data-visual-paused="true"');
});

function markup(motion: NodeMotion | undefined): string {
  const props = {
    data: { name: 'J123456', className: 'C5', security: -1, whClassId: 5, motion },
  } as unknown as NodeProps<ChainNode>;
  return renderToStaticMarkup(createElement(SystemNode, props));
}

test('widget frame carries header, disc, slots, and pointer-inert chrome rules', () => {
  const still = markup(undefined);
  expect(still).toContain('data-chain-node-name');
  expect(still).toContain('>J123456<');
  expect(still).toContain('font-ui');
  expect(still).toContain('text-nav');
  expect(still).toContain('font-bold');
  expect(still).toContain('data-chain-node-classification');
  expect(still).toContain('>C5<');
  expect(still).toContain('text-wh-c5');
  expect(still).toContain('whitespace-nowrap');
  expect(still).toContain('tracking-optical');
  expect(still).toContain('map-node-disc');
  expect(still).toContain('size-[55px]');
  expect(still).toContain('data-chain-node-widgets');
  expect(still).not.toContain('data-pilot-presence');
  expect(still.match(/pointer-events-auto/g)).toHaveLength(2);
  expect(still.match(/nopan/g)).toHaveLength(2);

  const noClass = renderToStaticMarkup(
    createElement(SystemNode, {
      data: { name: 'Jita', className: null },
    } as unknown as NodeProps<ChainNode>),
  );
  expect(noClass).toContain('data-chain-node-name');

  expect(markup({ phase: 'departing' })).not.toContain('pointer-events-auto');
  expect(markup({ phase: 'entering' }).match(/pointer-events-auto/g)).toHaveLength(2);
});

test('the header keeps the plain name while the disc owns the colored classification', () => {
  const nodeMarkup = (data: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SystemNode, {
        data,
        dragging: false,
      } as unknown as NodeProps<ChainNode>),
    );

  const jspaceNode = nodeMarkup({
    name: 'J123456',
    className: 'C4',
    security: -1,
    whClassId: 4,
  });
  expect(jspaceNode).toContain('>J123456<');
  expect(jspaceNode).toContain('>C4<');
  expect(jspaceNode).toContain('text-wh-c4');

  const kspaceNode = nodeMarkup({
    name: 'Jita',
    className: null,
    security: 0.946,
    whClassId: null,
  });
  expect(kspaceNode).toContain('>Jita<');
  expect(kspaceNode).toContain('>0.9<');
  expect(kspaceNode).toContain('text-sec-09');

  const halo = nodeMarkup({
    name: 'Perimeter',
    className: null,
    security: 0.9,
    whClassId: null,
    halo: { ring: 1, fogged: false },
  });
  expect(halo).toContain('>Perimeter<');
  expect(halo).toContain('>0.9<');
  expect(halo).toContain('text-name');
  expect(halo).toContain('text-sec-09');
  expect(halo).toContain('opacity-75');

  const stub = nodeMarkup({
    name: 'ABC-123',
    className: null,
    whClassId: 3,
    stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
  });
  expect(stub).toContain('ABC-123');
  expect(stub).toContain('text-name');
  expect(stub).toContain('data-chain-node-classification');
  expect(stub).toContain('>C3<');
  expect(stub).toContain('text-wh-c3');

  const hinted = nodeMarkup({
    name: 'ABC-123',
    className: null,
    whClassId: null,
    destinationHint: 'unknown',
    stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
  });
  expect(hinted).toContain('>ABC-123<');
  expect(hinted).toContain('data-chain-node-classification');
  expect(hinted).toContain('>C1–C3<');
  expect(hinted).toContain('text-wh-c2');
  expect(hinted).not.toContain('>C1<');

  const typedOverHint = nodeMarkup({
    name: 'ABC-123',
    className: null,
    whClassId: 7,
    destinationHint: 'unknown',
    stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
  });
  expect(typedOverHint).toContain('>HS<');
  expect(typedOverHint).toContain('text-sec-10');
  expect(typedOverHint).not.toContain('C1–C3');

  const blankStub = nodeMarkup({
    name: 'ABC-123',
    className: null,
    whClassId: null,
    stub: { connectionId: 'c1', fromSystemId: 1, signatureId: 'ABC-123' },
  });
  expect(blankStub).not.toContain('data-chain-node-classification');
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
  expect(rendered).toContain('data-wormhole-visual="unknown"');
  expect(rendered).toContain('data-visual-paused="true"');
  expect(rendered).toContain('data-visual-active="false"');

  const dangerous = renderToStaticMarkup(createElement(SystemNode, {
    ...props,
    data: { ...props.data, destinationHint: 'dangerous' },
  }));
  expect(dangerous).toContain('data-wormhole-visual="unknown"');

  const deadly = renderToStaticMarkup(createElement(SystemNode, {
    ...props,
    selected: true,
    data: { ...props.data, destinationHint: 'deadly' },
  }));
  expect(deadly).toContain('data-wormhole-visual="6"');
  expect(deadly).toContain('data-visual-active="true"');
  expect(deadly).toContain('data-visual-paused="true"');

  const hisec = renderToStaticMarkup(createElement(SystemNode, {
    ...props,
    selected: true,
    data: { ...props.data, destinationHint: 'hisec' },
  }));
  expect(hisec).not.toContain('data-wormhole-visual');
});

test('static stubs separate their code header from the colored destination class', () => {
  const props = {
    id: 'static-stub:31000001:C247:1',
    data: {
      name: 'C247',
      className: 'C3',
      whClassId: 3,
      stub: {
        staticId: '31000001:C247:1',
        fromSystemId: 31_000_001,
        code: 'C247',
        className: 'C3',
        whClassId: 3,
      },
    },
    dragging: false,
    isConnectable: false,
  } as unknown as NodeProps<ChainNode>;
  const rendered = renderToStaticMarkup(createElement(SystemNode, props));

  expect(rendered).toContain('data-chain-node-static-stub');
  expect(rendered).toContain('>C247<');
  expect(rendered).toContain('>C3<');
  expect(rendered).toContain('text-wh-c3');
  expect(rendered).toContain('border-dashed');
  expect(rendered).not.toContain('pointer-events-auto');
  expect(rendered).not.toContain('data-pilot-presence');
});

test('outbound arrow mounts by assignment, tones by liveness, and stays inside fog cut', () => {
  const frameNode = (x: number, y: number) => ({
    internals: { positionAbsolute: { x, y } },
    measured: {},
    width: SYSTEM_FRAME_WIDTH,
    height: SYSTEM_FRAME_HEIGHT,
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

test('presence badge tones, counts, and motion markup', () => {
  const badge = (count: number) =>
    renderToStaticMarkup(createElement(PresenceBadgeView, { count }));

  const live = badge(2);
  expect(live).toContain('data-pilot-presence="live"');
  expect(live).toContain('text-intel-pilot');
  expect(live).not.toContain('text-isk');
  expect(live).toContain('<svg');

  const one = badge(1);
  const two = badge(2);
  expect(one).not.toContain('data-pilot-presence-count');
  expect(two).toContain('data-pilot-presence-count');
  expect(two).toContain('>2<');

  const entering = markup({ phase: 'entering' });
  expect(entering).toContain('map-node-enter');
  expect(entering).toContain('map-node-disc');
  expect(markup({ phase: 'departing' })).toContain('map-node-exit');
  expect(markup({ phase: 'departing', heavy: true })).toContain('map-node-exit-heavy');
  expect(markup(undefined)).not.toMatch(/map-node-enter|map-node-exit/);

  expect(markup({ phase: 'entering' })).not.toContain('data-dragging');
  expect(nodeMotionClass(undefined)).toBeNull();
  expect(nodeMotionClass({ phase: 'entering' })).toBe('map-node-enter');
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
  expect(CHAIN_EDGE_INTERACTION_WIDTH).toBeGreaterThan(20);
});

test('chip font size keeps short labels and shrinks overflow to the disc', () => {
  expect(chipFontSizePx(20, 36, 14)).toBe(14);
  expect(chipFontSizePx(36, 36, 14)).toBe(14);
  expect(chipFontSizePx(72, 36, 14)).toBe(8);
  expect(chipFontSizePx(72, 36, 14, 6)).toBe(7);
  expect(chipFontSizePx(72, 0, 14)).toBe(14);
  expect(chipFontSizePx(72, 36, 0)).toBe(0);
});

test('edge gradients stay unique across repeated and punctuation-colliding edge IDs', () => {
  internalNodes.set('1', {
    internals: { positionAbsolute: { x: 0, y: 0 } },
    measured: { width: 150, height: 110 },
  });
  internalNodes.set('2', {
    internals: { positionAbsolute: { x: 300, y: 0 } },
    measured: { width: 150, height: 110 },
  });
  const edges = ['shared', 'shared', 'a:b', 'ab'].map((id, index) =>
    createElement(ChainLinkEdge, {
      id, source: '1', target: '2', key: index,
    } as unknown as EdgeProps<Edge<ChainEdgeData, 'chainLink'>>),
  );
  const rendered = renderToStaticMarkup(createElement('svg', null, ...edges));
  const ids = [...rendered.matchAll(/<linearGradient[^>]* id="([^"]+)"/g)].map((match) => match[1]);
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
});
