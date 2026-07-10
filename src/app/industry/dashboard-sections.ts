// The /industry dashboard's section rank model (3.7.24): the order the four
// section modules render in lives HERE as data, not in JSX order. Populated
// sections render first in the preferred order; empty sections sink to the
// bottom (as slim headers) keeping the same preferred order among themselves.
// A section whose data hasn't settled yet ('pending') renders with the
// populated group — optimistic, so nothing jumps until a section is CONFIRMED
// empty. Pure of React so the ordering and the per-section status rules are
// unit-tested directly.
//
// The `preferred` parameter is the seam for user-customizable section ordering
// (a future page-settings spec would feed a persisted order here); the default
// is the product-preferred order. Deliberately nothing more is built for that.

export type DashboardSectionId = 'recents' | 'saved' | 'active' | 'corp';
export type SectionStatus = 'pending' | 'empty' | 'populated';

// The dashboard's shared panel chrome — one definition for the grid cells and
// the page's static-shell skeleton (this module is plain TS so both the client
// coordinator and the server page can import it).
export const PANEL_CLASS = 'border border-border rounded-[5px] bg-section overflow-hidden';

export const PREFERRED_SECTION_ORDER: readonly DashboardSectionId[] = [
  'recents',
  'saved',
  'active',
  'corp',
];

export function orderSections(
  status: Readonly<Record<DashboardSectionId, SectionStatus>>,
  preferred: readonly DashboardSectionId[] = PREFERRED_SECTION_ORDER,
): DashboardSectionId[] {
  return [
    ...preferred.filter((id) => status[id] !== 'empty'),
    ...preferred.filter((id) => status[id] === 'empty'),
  ];
}

// Recents reads localStorage after mount: null = not read yet (the static
// shell / first paint), [] = read and empty.
export function recentsStatus(recent: readonly unknown[] | null): SectionStatus {
  if (recent === null) return 'pending';
  return recent.length > 0 ? 'populated' : 'empty';
}

// Saved builds settle from /api/account/saved-plans: an anonymous viewer gets
// {plans: []} (empty → the sunk header carries the sign-in hint), and a failed
// read sinks with the error line rather than holding a spinner slot open.
export function savedStatus(
  plans: readonly unknown[] | null,
  listFailed: boolean,
): SectionStatus {
  if (listFailed) return 'empty';
  if (plans === null) return 'pending';
  return plans.length > 0 ? 'populated' : 'empty';
}

// Active jobs: an empty roster means signed out / no linked character (the
// on-view read returns no characters) — that sinks with the sign-in hint. A
// populated roster with zero jobs sinks with the no-jobs line.
export function activeStatus(args: {
  loading: boolean;
  rosterSize: number;
  jobCount: number;
}): SectionStatus {
  if (args.loading) return 'pending';
  if (args.rosterSize === 0 || args.jobCount === 0) return 'empty';
  return 'populated';
}

// Corp jobs carries two app-side gates ahead of the data read:
//  - no linked characters → empty AND silent (the active section's sign-in
//    hint already prompts; no double-prompt — today's `return null` behavior).
//  - linked but no corp-eligible character → POPULATED: the scope-missing
//    AccessGate is actionable content (the relink CTA) and must not sink.
export function corpStatus(args: {
  hasLinkedCharacters: boolean;
  eligibleCount: number;
  loading: boolean;
  corpCount: number;
}): SectionStatus {
  if (!args.hasLinkedCharacters) return 'empty';
  if (args.eligibleCount === 0) return 'populated';
  if (args.loading) return 'pending';
  return args.corpCount > 0 ? 'populated' : 'empty';
}
