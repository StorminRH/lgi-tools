import type { AccountCharactersResponse } from '@/features/auth/api-contract';
import type { Session } from '@/features/auth/types';

// One linked character as the account-characters endpoint projects it — the
// roster the Run-As selector lists and validates against.
export type BuildCharacter = AccountCharactersResponse['characters'][number];

// The stored build-character id resolved against the linked roster (ACCOUNT.8).
// null id = unset ⇒ the frame mirrors the active character; an id with the
// roster still loading is `pending` (the frame shows its loading skeleton — an
// unvalidated id is never rendered); an id absent from the settled roster fails
// open to the mirror (absorbed away, purged — never auto-cleared, just unused).
// `needsReconnect` plays no role: a scope-broken character is still selectable
// (Phase 3 decides how missing data degrades). Strip dimmed-sets are
// participation-only preferences and never enter this seam — dimmed ≠ unselectable.
export function resolveBuildCharacter(
  selectedId: number | null,
  roster: BuildCharacter[] | null,
): { character: BuildCharacter | null; pending: boolean } {
  if (selectedId === null) return { character: null, pending: false };
  if (roster === null) return { character: null, pending: true };
  return {
    character: roster.find((c) => c.characterId === selectedId) ?? null,
    pending: false,
  };
}

// The Run-As frame's display state, derived from the auth session and (since
// ACCOUNT.8) the resolved build-character selection. Extracted from the JSX
// shell (Humble Component) so the branching is unit-tested while the frame stays
// visual-review only. `loading` is checked first, so a settled session that
// resolved to null reads `anon` — never a stuck `loading`. A pending selection
// also reads `loading`: the wrong portrait must never flash while the roster
// resolves. With no selection the frame mirrors the active character, exactly
// the pre-ACCOUNT.8 path.
export type RunAsView =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'present'; characterId: number; name: string; portraitUrl: string };

export function runAsView(
  state: { session: Session | null; loading: boolean },
  selection?: { character: BuildCharacter | null; pending: boolean },
): RunAsView {
  if (state.loading) return { kind: 'loading' };
  if (state.session === null) return { kind: 'anon' };
  if (selection?.pending) return { kind: 'loading' };
  if (selection?.character) {
    const { characterId, name, portraitUrl } = selection.character;
    return { kind: 'present', characterId, name, portraitUrl };
  }
  const { characterId, name, portraitUrl } = state.session;
  return { kind: 'present', characterId, name, portraitUrl };
}
