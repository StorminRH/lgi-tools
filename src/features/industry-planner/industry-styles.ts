// Feature-level domain → UI mapping for the Industry Planner. The only place
// that knows "a thin margin is orange" or "activity 1 is Manufacturing". The
// reusable primitives stay domain-agnostic; this file picks tones/labels from
// the shared vocabulary (CLAUDE.md > Architecture Invariants).

import { toneTextClass } from '@/components/ui/tones';

// Below this percentage a positive margin is "thin" (orange) rather than
// healthy (green). A rough cut for at-a-glance scanning, not a trading signal.
const THIN_MARGIN_PCT = 5;

// Text-colour class for a margin figure. Loss → red, thin → orange, healthy →
// green, unknown (no product sell price) → muted.
export function marginToneClass(marginPct: number | null): string {
  if (marginPct === null) return 'text-muted';
  if (marginPct < 0) return toneTextClass('red');
  if (marginPct < THIN_MARGIN_PCT) return toneTextClass('orange');
  return toneTextClass('green');
}

// Industry activity labels. Manufacturing (1) and reactions (11) are the only
// activities the planner models (see eve-data INDUSTRY_ACTIVITY_IDS).
export const ACTIVITY_LABEL: Record<number, string> = {
  1: 'Manufacturing',
  11: 'Reaction',
};

export function activityLabel(activityId: number): string {
  return ACTIVITY_LABEL[activityId] ?? 'Industry';
}
