import { describe, expect, it } from 'vitest';
import { attachingEdgeOf, parseReplayArgs, planSpawnSteps } from './map-replay-plan';

describe('replay argument parsing', () => {
  it('parses a full well-formed invocation, skipping the pnpm separator', () => {
    expect(
      parseReplayArgs(['--', '--user', 'u1', '--chain', '33', '--interval-ms', '600', '--loop']),
    ).toEqual({ mapId: null, userId: 'u1', chainSeed: 33, intervalMs: 600, loop: true });
  });

  it('defaults chain and interval, and accepts --map instead of --user', () => {
    expect(parseReplayArgs(['--map', 'm1'])).toEqual({
      mapId: 'm1',
      userId: null,
      chainSeed: 12,
      intervalMs: 1500,
      loop: false,
    });
  });

  it.each([
    [['--bogus'], 'unknown flag'],
    [['--chain', 'x', '--map', 'm1'], 'non-numeric chain'],
    [['--map', 'm1', '--interval-ms', '-5'], 'negative interval'],
    [[], 'neither map nor user'],
    [['--map'], 'value flag with no value'],
  ])('rejects %j (%s)', (argv) => {
    expect(parseReplayArgs(argv as string[])).toBeNull();
  });
});

describe('spawn planning', () => {
  const A = 31_000_001;
  const B = 31_000_002;
  const C = 31_000_003;

  it('places each connection at its step when both endpoints exist', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }, { systemId: B }],
        connections: [{ fromSystemId: A, toSystemId: B }],
      },
      [2],
      2,
    );
    expect(plan.steps.map((step) => step.systemId)).toEqual([A, B]);
    expect(plan.steps[1]?.connections).toEqual([{ fromSystemId: A, toSystemId: B }]);
    expect(plan.unplaceable).toEqual([]);
  });

  it('skips self-loops the live entity contract forbids', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }],
        connections: [{ fromSystemId: A, toSystemId: A }],
      },
      [1],
      1,
    );
    expect(plan.steps[0]?.skippedSelfLoops).toEqual([{ fromSystemId: A, toSystemId: A }]);
    expect(plan.steps[0]?.connections).toEqual([]);
  });

  it('defers an early edge until its endpoint spawns, then drains it', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }, { systemId: B }, { systemId: C }],
        connections: [{ fromSystemId: A, toSystemId: C }],
      },
      [1],
      3,
    );
    expect(plan.steps[0]?.newlyDeferred).toEqual([{ fromSystemId: A, toSystemId: C }]);
    expect(plan.steps[1]?.connections).toEqual([]);
    expect(plan.steps[1]?.drainedConnections).toEqual([]);
    expect(plan.steps[2]?.connections).toEqual([]);
    expect(plan.steps[2]?.drainedConnections).toEqual([{ fromSystemId: A, toSystemId: C }]);
    expect(plan.unplaceable).toEqual([]);
  });

  it('keeps a current-step discovering edge out of the drained list', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }, { systemId: B }, { systemId: C }],
        connections: [
          { fromSystemId: A, toSystemId: C },
          { fromSystemId: B, toSystemId: C },
        ],
      },
      [1, 3],
      3,
    );
    const step = plan.steps[2];
    expect(step?.drainedConnections).toEqual([{ fromSystemId: A, toSystemId: C }]);
    expect(step?.connections).toEqual([{ fromSystemId: B, toSystemId: C }]);
    expect(step && attachingEdgeOf(step)).toEqual({ fromSystemId: B, toSystemId: C });
  });

  it('falls back to a drained edge when it alone discovers the system', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }, { systemId: B }, { systemId: C }],
        connections: [{ fromSystemId: A, toSystemId: C }],
      },
      [1],
      3,
    );
    const step = plan.steps[2];
    expect(step && attachingEdgeOf(step)).toEqual({ fromSystemId: A, toSystemId: C });
  });

  it('reports an edge that never becomes placeable', () => {
    const plan = planSpawnSteps(
      {
        systems: [{ systemId: A }],
        connections: [{ fromSystemId: A, toSystemId: B }],
      },
      [1],
      1,
    );
    expect(plan.unplaceable).toEqual([{ fromSystemId: A, toSystemId: B }]);
  });
});
