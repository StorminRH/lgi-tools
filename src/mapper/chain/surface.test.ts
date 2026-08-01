import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';
import { SystemNode, type ChainNode } from '../canvas/SystemNode';
import { NoMapAccess } from './NoMapAccess';

const mocks = vi.hoisted(() => ({ reactFlow: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@xyflow/react', async () => {
  const { createElement: element } = await import('react');
  mocks.reactFlow.mockImplementation(({ children }: { children?: unknown }) =>
    element('div', { 'data-react-flow': '' }, children as never),
  );
  return {
    ReactFlow: mocks.reactFlow,
    Background: () => element('div', { 'data-react-flow-background': '' }),
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => element('div', { 'data-handle': '' }),
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  };
});

function nodeMarkup(name: string, className: string | null): string {
  const props = { data: { name, className } } as unknown as NodeProps<ChainNode>;
  return renderToStaticMarkup(createElement(SystemNode, props));
}

// ── SC-3 · DC-3 — what a populated node actually says ───────────────────────
describe('system node rendering', () => {
  it('shows the directory name and its class chip', () => {
    const markup = nodeMarkup('J123456', 'C5');

    expect(markup).toContain('J123456');
    expect(markup).toContain('data-chain-node-class');
    expect(markup).toContain('C5');
  });

  it('omits the class chip entirely for a system with no class', () => {
    const markup = nodeMarkup('Jita', null);

    expect(markup).toContain('Jita');
    expect(markup).not.toContain('data-chain-node-class');
  });
});

// ── SC-5 · DC-5 / AC-5 / V-4 — no spinner, no refresh control, in any state ──
describe('map surface inspection', () => {
  async function emptyCanvasMarkup(): Promise<string> {
    const { MapCanvas } = await import('../canvas/MapCanvas');
    return renderToStaticMarkup(createElement(MapCanvas));
  }

  it('renders the canvas frame immediately with no loading state', async () => {
    const markup = await emptyCanvasMarkup();

    expect(markup).toContain('data-map-canvas');
    expect(markup).toContain('data-react-flow-background');
  });

  it.each(['empty', 'populated', 'calm'])(
    'has no spinner and no refresh control in the %s state',
    async (state) => {
      const markup =
        state === 'empty'
          ? await emptyCanvasMarkup()
          : state === 'populated'
            ? nodeMarkup('J123456', 'C5')
            : renderToStaticMarkup(createElement(NoMapAccess));

      expect(markup).not.toMatch(/progressbar|aria-busy|spinner/i);
      expect(markup).not.toMatch(/refresh|reload|try again|retry/i);
      expect(markup).not.toMatch(/loading/i);
    },
  );
});

// ── SC-7 · DC-7 / AC-7 — the reconciler is the only merge the canvas consumes ─
describe('mapper source contract', () => {
  const ROOT = 'src/mapper';

  function mapperFiles(): string[] {
    return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .map((name) => name.replaceAll('\\', '/'));
  }

  /**
   * A file's CODE, with comments stripped.
   *
   * Prose naming a forbidden API is not a use of it — these modules document the constraints they
   * uphold, and asserting against raw text would fail on its own documentation.
   */
  function sourceOf(relative: string): string {
    return readFileSync(`${ROOT}/${relative}`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  // Guards every loop below: an empty or broken file walk would make them all pass vacuously.
  it('walks the whole mapper zone', () => {
    expect(mapperFiles().toSorted()).toEqual([
      'canvas/ChainSurface.tsx',
      'canvas/MapCanvas.tsx',
      'canvas/SystemNode.tsx',
      'chain/ChainHost.tsx',
      'chain/NoMapAccess.tsx',
      'chain/intents.ts',
      'chain/labels.ts',
      'chain/nodes.ts',
      'chain/placement.ts',
      'chain/reconciler.ts',
      'chain/use-map-chain.ts',
      'index.ts',
    ]);
  });

  it('imports no Convex package directly — the data slice owns the client', () => {
    const readers = mapperFiles().filter((file) =>
      sourceOf(file).includes("from 'convex/"),
    );

    expect(readers).toEqual([]);
  });

  it('reaches Convex through exactly one slice hook, in the chain layer', () => {
    const consumers = mapperFiles().filter((file) =>
      sourceOf(file).includes('@/data/convex/use-drained-pages'),
    );

    expect(consumers).toEqual(['chain/use-map-chain.ts']);
  });

  it('keeps the two subscriptions split so a connection write cannot re-read systems', () => {
    // HC-2's client half: two calls against two functions, never one aggregate read.
    const hook = sourceOf('chain/use-map-chain.ts');

    expect(hook).toContain('api.mapChain.watchMapSystems');
    expect(hook).toContain('api.mapChain.watchMapConnections');
    expect((hook.match(/useDrainedPages\(/g) ?? []).length).toBe(2);
  });

  it('adds no client-callable mutation anywhere in the mapper', () => {
    // OOS-3: this session reads only. The removal seams are internal Convex mutations.
    for (const file of mapperFiles()) {
      expect(sourceOf(file), `${file} must call no mutation`).not.toMatch(
        /useMutation|useAction/,
      );
    }
  });

  it('keeps canvas modules off the subscription and its raw pages', () => {
    for (const file of mapperFiles().filter((name) => name.startsWith('canvas/'))) {
      const source = sourceOf(file);
      expect(source, `${file} must not read Convex`).not.toContain("from 'convex/react'");
      expect(source, `${file} must not read the chain hook`).not.toContain('use-map-chain');
      expect(source, `${file} must not build state from pages`).not.toContain(
        'usePaginatedQuery',
      );
    }
  });

  it('introduces no server-side Convex read for the map route', () => {
    // HC-3: the client subscribes directly and the route stays static.
    for (const file of mapperFiles()) {
      expect(sourceOf(file)).not.toMatch(/preloadQuery|fetchQuery/);
    }
  });
});
