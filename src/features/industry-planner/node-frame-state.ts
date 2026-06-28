import type { NodeMeState } from './me-overrides';

// The build-plan node's icon-frame tone (3.7.5.8), combining a blueprint's ME and
// TE into ONE state for the framed icon — an at-a-glance ownership read, with the
// per-axis ME/TE detail living in the icon's popover. Precedence:
//   'manual'  — a manual what-if override is set on EITHER axis (orange)
//   'owned'   — no override, but the player owns the blueprint at all, even an
//               unresearched ME0/TE0 copy (blue): "owned or researched"
//   'unowned' — not owned and not overridden (hollow outline)
// `ownedMe`/`ownedTe` are membership maps of the OWNED blueprints (a present key
// means owned), so a null map (read unsettled / logged out) reads as not owned.
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
