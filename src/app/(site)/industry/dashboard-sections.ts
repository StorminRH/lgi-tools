export type DashboardSectionId = 'recents' | 'saved' | 'active' | 'corp';

export type SectionStatus = 'pending' | 'empty' | 'populated';

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

export function recentsStatus(recent: readonly unknown[] | null): SectionStatus {
  if (recent === null) return 'pending';
  return recent.length > 0 ? 'populated' : 'empty';
}

export function savedStatus(
  plans: readonly unknown[] | null,
  listFailed: boolean,
): SectionStatus {
  if (listFailed) return 'empty';
  if (plans === null) return 'pending';
  return plans.length > 0 ? 'populated' : 'empty';
}

export function activeStatus(args: {
  loading: boolean;
  rosterSize: number;
  jobCount: number;
}): SectionStatus {
  if (args.loading) return 'pending';
  if (args.rosterSize === 0 || args.jobCount === 0) return 'empty';
  return 'populated';
}

export function deriveSectionRender(
  status: SectionStatus,
  hint: string | undefined,
): { meta: boolean; hint: string | null; body: boolean } {
  const isEmpty = status === 'empty';
  return {
    meta: status === 'populated',
    hint: isEmpty && hint !== undefined ? hint : null,
    body: !isEmpty,
  };
}

export function activeJobsHint(rosterSize: number): string {
  return rosterSize === 0
    ? 'Sign in with EVE (top right) to track your industry jobs here.'
    : 'No industry jobs running.';
}

export function corpHint(hasLinkedCharacters: boolean): string | undefined {
  return hasLinkedCharacters
    ? 'No corporation industry jobs yet — they’ll appear here once a sync completes.'
    : undefined;
}

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
