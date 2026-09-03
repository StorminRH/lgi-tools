import type { NodeMeState } from './me-overrides';

export function nodeFrameState(
  blueprintTypeId: number,
  ownedMe: Map<number, number> | null,
  ownedTe: Map<number, number> | null,
  meOverrides: Map<number, number>,
  teOverrides: Map<number, number>,
): NodeMeState {
  if (meOverrides.has(blueprintTypeId) || teOverrides.has(blueprintTypeId)) return 'manual';
  if (ownedMe?.has(blueprintTypeId) || ownedTe?.has(blueprintTypeId)) return 'owned';
  return 'unowned';
}
