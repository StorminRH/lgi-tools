import type { PanelCharacter } from '@/components/live-character-card';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from './esi-projection';
import { currentTraining, type CurrentTraining } from './progress';

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

  hasData: boolean;
  totalSp: number | null;
  unallocatedSp: number | null;
  training: CurrentTraining;

  currentSkillName: string | null;

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

export function rosterSpFallback(vm: RosterViewModel): string {
  return vm.needsReconnect ? 'Reconnect to sync' : 'No data yet';
}

export function rosterFreeSp(vm: RosterViewModel): number | null {
  return vm.unallocatedSp !== null && vm.unallocatedSp > 0 ? vm.unallocatedSp : null;
}

export function idleTrainingText(kind: 'empty' | 'complete'): string {
  return kind === 'empty' ? 'No skills queued' : 'Training complete';
}
