// The view model the home roster card renders for one character — the linked-character
// truth (name/portrait/reconnect) joined with the Neon skills read (totals + the
// current-training derivation). Pure, so the card is branch-on-kind only and the ?demo
// path can seed it directly without a fetch or auth.
import type { PanelCharacter } from '@/components/live-character-card';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from './esi-projection';
import { currentTraining, type CurrentTraining } from './progress';

// The live half of one row, as the Neon skills read returns it per character (the
// extra characterId on the wire is ignored here).
export interface RosterLiveData {
  data: { entries: SkillQueueEntry[]; totalSp: number; unallocatedSp?: number } | null;
  lastSyncedAt: number | null;
  syncError: string | null;
}

export interface RosterViewModel {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
  // false until the first successful sync lands a payload (data === null).
  hasData: boolean;
  totalSp: number | null;
  unallocatedSp: number | null;
  training: CurrentTraining;
  // Resolved name of the currently-training/paused skill, null when none or
  // unresolved (falls back to the id in the card).
  currentSkillName: string | null;
  // Pre-formatted "finishes in …", only when actively training.
  remainingLabel: string | null;
}

export function buildRosterCard(
  character: PanelCharacter,
  live: RosterLiveData | undefined,
  names: Record<string, string>,
  now: number,
): RosterViewModel {
  const data = live?.data ?? null;
  const training: CurrentTraining =
    data !== null ? currentTraining(data.entries, now) : { kind: 'empty' };
  const skillId =
    training.kind === 'training' || training.kind === 'paused' ? training.skillId : null;
  const remainingLabel =
    training.kind === 'training' && Number.isFinite(training.finishesAt)
      ? formatRemaining(training.finishesAt - now)
      : null;
  return {
    characterId: character.characterId,
    name: character.name,
    portraitUrl: character.portraitUrl,
    needsReconnect: character.needsReconnect,
    hasData: data !== null,
    totalSp: data?.totalSp ?? null,
    unallocatedSp: data?.unallocatedSp ?? null,
    training,
    currentSkillName: skillId !== null ? (names[String(skillId)] ?? null) : null,
    remainingLabel,
  };
}
