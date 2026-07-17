// Domain → tone mapping for the skill-queue feature. The only place that
// knows "training is green" — UI primitives stay tone-abstract.
import type { Tone } from '@/components/ui/tones';
import type { EntryStatus } from './progress';

/** Authoritative mapping from skill-queue connection states to labels and semantic tones. */
export const STATUS_META: Record<EntryStatus, { label: string; tone: Tone }> = {
  training: { label: 'Training', tone: 'green' },
  done: { label: 'Done', tone: 'teal' },
  pending: { label: 'Queued', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'orange' },
};

// `syncErrorMeta` now lives in src/components/live-character-sync (shared with
// the industry-jobs tracker).
