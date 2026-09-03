import { randomUUID } from 'node:crypto';

const freshResolutionIds = new Set<string>();

export function markFreshPriceResolution(): string {
  const id = randomUUID();
  freshResolutionIds.add(id);
  return id;
}

export function consumeFreshPriceResolution(id: string): boolean {
  return freshResolutionIds.delete(id);
}
