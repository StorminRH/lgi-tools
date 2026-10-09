import type { PendingWhStaticsReview } from '@/data/wh-statics/queries';
import type { WhStaticsSystemCodes } from '@/data/wh-statics/schema';

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  busy: 'Another statics refresh is already running.',
  'feed-unavailable': 'The community feed was unavailable; the promoted copy was not changed.',
  promoted: 'The pending statics snapshot was promoted.',
  rejected: 'The pending statics snapshot was rejected.',
  'snapshot-pending': 'A changed feed was recorded for review.',
  'stale-observation':
    'A newer feed observation was already recorded; the pending snapshot was left alone.',
  unchanged: 'The community feed is unchanged.',
};

/** The notice for the `outcome` a statics action redirects back with, if it is one we know. */
export function outcomeMessage(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' ? OUTCOME_LABELS[raw] : undefined;
}

/** One titled list in the review's difference or lineage panel. */
export interface ReviewList {
  title: string;
  items: string[];
  /** Spans both columns, for lines long enough to need the width. */
  wide: boolean;
  /** Runs short items together on one comma-separated line. */
  inline: boolean;
}

function codeList(codes: readonly string[]): string {
  return codes.join(', ') || 'none';
}

function systemLines(systems: readonly WhStaticsSystemCodes[]): string[] {
  return systems.map((system) => `${system.systemId}: ${codeList(system.codes)}`);
}

function list(title: string, items: string[], layout: Partial<Pick<ReviewList, 'wide' | 'inline'>> = {}): ReviewList {
  return { title, items, wide: layout.wide ?? false, inline: layout.inline ?? false };
}

export function differenceLists({ difference }: PendingWhStaticsReview): ReviewList[] {
  return [
    list('Systems added, with the codes they gain', systemLines(difference.systemsAdded)),
    list('Systems removed, with the codes they lose', systemLines(difference.systemsRemoved)),
    list(
      'Systems changed',
      difference.systemsChanged.map(
        (entry) => `${entry.systemId}: ${codeList(entry.before)} → ${codeList(entry.after)}`,
      ),
      { wide: true },
    ),
    list('New code types', [...difference.codesAdded], { inline: true }),
    list('Removed code types', [...difference.codesRemoved], { inline: true }),
  ];
}

export function lineageLists({ crossCheck }: PendingWhStaticsReview): ReviewList[] {
  return [
    list('Lineage-only systems', crossCheck.lineageOnlySystems.map(String)),
    list('Feed-only systems', crossCheck.feedOnlySystems.map(String)),
    list(
      'Code-set disagreements',
      crossCheck.disagreements.map(
        (entry) => `${entry.systemId}: feed ${codeList(entry.feedCodes)}; lineage ${codeList(entry.lineageCodes)}`,
      ),
      { wide: true },
    ),
  ];
}

export function lineageDifferenceCount({ crossCheck }: PendingWhStaticsReview): number {
  return crossCheck.disagreements.length + crossCheck.lineageOnlySystems.length + crossCheck.feedOnlySystems.length;
}

export function reviewFigures({ difference, crossCheck }: PendingWhStaticsReview): { title: string; value: number }[] {
  return [
    { title: 'Systems added', value: difference.systemsAdded.length },
    { title: 'Systems removed', value: difference.systemsRemoved.length },
    { title: 'Systems changed', value: difference.systemsChanged.length },
    { title: 'Lineage disagreements', value: crossCheck.disagreements.length },
  ];
}
