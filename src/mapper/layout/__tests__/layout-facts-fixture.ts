import type { LayoutFacts } from '../layout-contract';

export function layoutFacts(
  systemIds: readonly number[],
  connections: readonly (readonly [number, number])[] = [],
  rootSystemId?: number,
): LayoutFacts {
  return {
    systems: systemIds.map((systemId) => ({ systemId })),
    connections: connections.map(([fromSystemId, toSystemId]) => ({
      fromSystemId,
      toSystemId,
    })),
    ...(rootSystemId === undefined ? {} : { rootSystemId }),
  };
}
