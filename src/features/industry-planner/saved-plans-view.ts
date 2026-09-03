import type { SavedPlanRow } from './api-contract';

export type SavedPlansEchoResult =
  | { ok: true; data: { plans: SavedPlanRow[] } }
  | { ok: false; status: number }
  | { ok: false; kind: 'network'; aborted: boolean; cause: unknown };

export const SAVED_TILES_MAX = 8;

export function savedTiles(
  plans: readonly SavedPlanRow[],
  max: number = SAVED_TILES_MAX,
): { tiles: SavedPlanRow[]; overflow: number } {
  return { tiles: plans.slice(0, max), overflow: Math.max(0, plans.length - max) };
}

export function savedEmptyLine(args: { listFailed: boolean; signedOut: boolean }): string {
  if (args.listFailed) return "Couldn't load your saved templates";
  if (args.signedOut) return 'Sign in to save build templates';
  return 'No saved templates yet — save one from the planner';
}

export type SavedPlansViewState =
  | { kind: 'blank' }
  | { kind: 'empty'; line: string }
  | { kind: 'list' };

export function savedPlansViewState(
  plans: readonly SavedPlanRow[] | null,
  roster: readonly unknown[] | null,
  listFailed: boolean,
): SavedPlansViewState {
  const signedOut = roster !== null && roster.length === 0;
  const settledEmpty = plans !== null && plans.length === 0;
  if (plans === null || (settledEmpty && !listFailed && roster === null)) return { kind: 'blank' };
  if (listFailed || signedOut || settledEmpty) {
    return { kind: 'empty', line: savedEmptyLine({ listFailed, signedOut }) };
  }
  return { kind: 'list' };
}

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

export function saveErrorCopy(status: number): string {
  if (status === 401) return 'Sign in to save build templates';
  if (status === 409) return 'Template limit reached — delete one first';
  return "Couldn't save the template";
}

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

export function echoOutcome(
  res: SavedPlansEchoResult | null,
  errorFor: (status: number) => string,
): { plans: SavedPlanRow[] } | { error: string } {
  if (res !== null && res.ok) return { plans: res.data.plans };
  return {
    error: errorFor(res === null || !('status' in res) ? 0 : res.status),
  };
}
