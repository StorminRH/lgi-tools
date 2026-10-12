import type { EsiReadSession } from '@/data/esi-store/session';
import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  runOwnerSync,
  type SingleOwnerRead,
} from '@/platform/owner-sync';
import { parseSkillQueueBody, parseSkillsBody } from './esi-projection';
import { canSyncSkillQueue } from './sync-eligibility';
import type { CharacterSkillSyncState, SkillsPort, SkillsSaveHalves } from './types';

export type SkillsPersistPlan =
  | { kind: 'save'; halves: SkillsSaveHalves }
  | { kind: 'stamp' }
  | { kind: 'skip'; code?: string };

export function planSkillsPersist(
  queueRead: SingleOwnerRead,
  skillsRead: SingleOwnerRead,
): SkillsPersistPlan {
  if (queueRead.kind === 'error') return { kind: 'skip', code: queueRead.code };
  if (skillsRead.kind === 'error') return { kind: 'skip', code: skillsRead.code };

  const halves: SkillsSaveHalves = {};
  if (queueRead.kind === 'fresh') {
    const entries = parseSkillQueueBody(queueRead.body);
    if (entries === null) return { kind: 'skip', code: 'contract_error' };
    halves.queue = { entries, etag: queueRead.etag };
  }
  if (skillsRead.kind === 'fresh') {
    const totals = parseSkillsBody(skillsRead.body);
    if (totals === null) return { kind: 'skip', code: 'contract_error' };
    halves.skills = { totalSp: totals.totalSp, levels: totals.levels, etag: skillsRead.etag };
    if (totals.unallocatedSp !== undefined) halves.skills.unallocatedSp = totals.unallocatedSp;
  }

  if (halves.queue === undefined && halves.skills === undefined) return { kind: 'stamp' };
  return { kind: 'save', halves };
}

interface SkillsSave {
  halves: SkillsSaveHalves;
}

function makeDescriptor(port: SkillsPort): OwnerSyncDescriptor<number, CharacterSkillSyncState, SkillsSave, EsiReadSession> {
  return makeCharacterDescriptor(port, {
    eligible: canSyncSkillQueue,
    fetchAndPlan: async (characterId, accessToken, _state, session) => {
      const [queueRead, skillsRead] = await Promise.all([
        port.readSkillQueue(session, characterId, accessToken),
        port.readSkills(session, characterId, accessToken),
      ]);
      return planSkillsPersist(queueRead, skillsRead);
    },
    save: (characterId, payload) => port.saveSkills(characterId, payload.halves),
  });
}

export function refreshSkillsForUser(
  port: SkillsPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(makeDescriptor(port), userId);
}
