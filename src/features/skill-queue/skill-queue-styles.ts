import type { Tone } from '@/components/ui/tones';
import type { EntryStatus } from './progress';

export const STATUS_META: Record<EntryStatus, { label: string; tone: Tone }> = {
  training: { label: 'Training', tone: 'green' },
  done: { label: 'Done', tone: 'teal' },
  pending: { label: 'Queued', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'orange' },
};

