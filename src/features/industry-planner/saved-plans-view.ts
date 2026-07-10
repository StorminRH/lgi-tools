// View logic for the template surfaces (3.7.24): the dashboard section's tile
// cut and the empty-state copy shared with the full /industry/templates page.
// The list arrives SERVER-ordered (favorites first, then most recently
// updated) — consumers never re-sort, so the cut here is a plain slice.
import type { SavedPlanRow } from './api-contract';

export const SAVED_TILES_MAX = 8;

export function savedTiles(
  plans: readonly SavedPlanRow[],
  max: number = SAVED_TILES_MAX,
): { tiles: SavedPlanRow[]; overflow: number } {
  return { tiles: plans.slice(0, max), overflow: Math.max(0, plans.length - max) };
}

// One line for a settled-empty saved list, by cause. The signed-out signal is
// the settled-[] roster (null = still loading — callers pass signedOut=false
// until it settles).
export function savedEmptyLine(args: { listFailed: boolean; signedOut: boolean }): string {
  if (args.listFailed) return "Couldn't load your saved templates";
  if (args.signedOut) return 'Sign in to save build templates';
  return 'No saved templates yet — save one from the planner';
}

// The mutation-echo decision (every saved-plans endpoint echoes the full
// updated list): the new list on success, the endpoint-specific error copy
// otherwise (a network failure arrives as null → status 0). Pure so the hook
// stays a thin shell.
export function echoOutcome(
  res: { ok: true; data: { plans: SavedPlanRow[] } } | { ok: false; status: number } | null,
  errorFor: (status: number) => string,
): { plans: SavedPlanRow[] } | { error: string } {
  if (res !== null && res.ok) return { plans: res.data.plans };
  return { error: errorFor(res === null ? 0 : res.status) };
}
