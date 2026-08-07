import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';
import type { NodeMotion } from '../motion/motion-contract';
import type { PresencePilot, SystemPresence } from '../tracking/presence-model';
import { edgeMotionClass, edgePresentation } from './ChainLinkEdge';
import { PresenceBadgeView } from './PilotPresenceBadge';
import { SystemNode, nodeMotionClass, type ChainNode } from './SystemNode';

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  return {
    BaseEdge: () => element('path'),
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    useInternalNode: () => undefined,
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
