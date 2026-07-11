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

// The /industry/templates manager's render state: `blank` while the very first
// read (or roster) is still in flight, `empty` (with its cause line) for a
// settled-empty / failed / signed-out list, else `list`. Pure so the page stays a
// render shell over the shared list hook.
export type SavedPlansState = { kind: 'blank' } | { kind: 'empty'; line: string } | { kind: 'list' };

export function savedPlansViewState(
  plans: readonly SavedPlanRow[] | null,
  roster: readonly unknown[] | null,
  listFailed: boolean,
): SavedPlansState {
  const signedOut = roster !== null && roster.length === 0;
  const settledEmpty = plans !== null && plans.length === 0;
  if (plans === null || (settledEmpty && !listFailed && roster === null)) return { kind: 'blank' };
  if (listFailed || signedOut || settledEmpty) {
    return { kind: 'empty', line: savedEmptyLine({ listFailed, signedOut }) };
  }
  return { kind: 'list' };
}

// The templates popover's empty-list line, by cause. `buildCharacters` settles []
// for an anonymous visitor (null = still loading); `plans` null = the list read
// is still in flight.
export function templatesEmptyLine(args: {
  listFailed: boolean;
  buildCharacters: readonly unknown[] | null;
  plans: readonly unknown[] | null;
}): string {
  const signedOut = args.buildCharacters !== null && args.buildCharacters.length === 0;
  if (args.listFailed) return "Couldn't load your saved templates";
  if (signedOut) return 'Sign in to save build templates';
  if (args.plans === null) return 'Loading…';
  return 'No saved templates yet';
}

// The save-endpoint error copy by HTTP status (fed to applyEcho): the anonymous
// and quota cases speak plainly, everything else is a generic failure.
export function saveErrorCopy(status: number): string {
  if (status === 401) return 'Sign in to save build templates';
  if (status === 409) return 'Template limit reached — delete one first';
  return "Couldn't save the template";
}

// The per-row render strings for a saved-template row: the favorite + delete
// aria labels, glyphs, and state classes. Pulled out of the row component so its
// shell carries only the editing/armed render branches.
export function savedPlanRowLabels(
  row: Pick<SavedPlanRow, 'name' | 'favorite'>,
  armed: boolean,
): {
  favoriteAria: string;
  favoriteGlyph: string;
  favoriteClass: string;
  deleteAria: string;
  deleteClass: string;
} {
  return {
    favoriteAria: row.favorite ? `Unfavorite ${row.name}` : `Favorite ${row.name}`,
    favoriteGlyph: row.favorite ? '★' : '☆',
    favoriteClass: row.favorite ? 'text-isk hover:text-isk' : '',
    deleteAria: armed ? `Confirm deleting ${row.name}` : `Delete ${row.name}`,
    deleteClass: armed ? 'text-tone-red hover:text-tone-red' : '',
  };
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
