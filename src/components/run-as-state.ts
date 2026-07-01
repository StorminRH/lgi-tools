import type { Session } from '@/features/auth/types';

// The Run-As frame's display state, derived from the auth session. Extracted from
// the JSX shell (Humble Component) so the tri-state branch is unit-tested while the
// frame stays visual-review only. `loading` is checked first, so a settled session
// that resolved to null reads `anon` — never a stuck `loading`.
export type RunAsView =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'present'; characterId: number; name: string; portraitUrl: string };

export function runAsView(state: { session: Session | null; loading: boolean }): RunAsView {
  if (state.loading) return { kind: 'loading' };
  if (state.session === null) return { kind: 'anon' };
  const { characterId, name, portraitUrl } = state.session;
  return { kind: 'present', characterId, name, portraitUrl };
}
