import { expect, test, vi } from 'vitest';
import { buildHubJumpIndex } from './trade-hubs';

test('indexes gate distances lazily, orders reachable hubs and reuses computed results', () => {
  const graph = new Map<number, number[]>([
    [30000142, [1]], [1, [30000142, 2]],
    [2, [1, 30002187, 30002659]],
    [30002187, [2]], [30002659, [2]],
  ]);
  const neighbours = vi.fn((id: number) => graph.get(id) ?? []);
  const lookup = buildHubJumpIndex(neighbours);
  expect(neighbours).not.toHaveBeenCalled();
  const rows = lookup(2);
  expect(rows).toEqual([
    { id: 30002187, name: 'Amarr', jumps: 1 },
    { id: 30002659, name: 'Dodixie', jumps: 1 },
    { id: 30000142, name: 'Jita', jumps: 2 },
    { id: 30002510, name: 'Rens', jumps: null },
    { id: 30002053, name: 'Hek', jumps: null },
  ]);
  const reads = neighbours.mock.calls.length;
  expect(lookup(2)).toBe(rows);
  expect(lookup(30000142)[0]).toEqual({ id: 30000142, name: 'Jita', jumps: 0 });
  expect(lookup(99).every((hub) => hub.jumps === null)).toBe(true);
  expect(neighbours).toHaveBeenCalledTimes(reads);
});
