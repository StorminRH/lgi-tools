import { randomUUID } from 'node:crypto';

// A remote-cache fill executes in this process before its serialized result is
// returned. Consume its opaque id once: the filling request records upstream
// work, while later and coalesced consumers record a cache hit without relying
// on millisecond timestamp ordering.
const freshResolutionIds = new Set<string>();

export function markFreshPriceResolution(): string {
  const id = randomUUID();
  freshResolutionIds.add(id);
  return id;
}

export function consumeFreshPriceResolution(id: string): boolean {
  return freshResolutionIds.delete(id);
}
