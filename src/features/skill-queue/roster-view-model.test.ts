import { describe, expect, it } from 'vitest';
import type { PanelCharacter } from '@/components/live-character-card';
import { buildRosterCard, type RosterLiveData } from './roster-view-model';

const NOW = Date.parse('2026-06-11T12:00:00Z');

const character: PanelCharacter = {
  characterId: 91012740,
  name: 'Stormin Jr',
  portraitUrl: 'https://images.evetech.net/characters/91012740/portrait?size=64',
  needsReconnect: false,
};

const trainingLive: RosterLiveData = {
  data: {
    totalSp: 41_500_000,
    unallocatedSp: 405_000,
    entries: [
      {
        skill_id: 3327,
        queue_position: 0,
        finished_level: 5,
        start_date: '2026-06-11T00:00:00Z',
        finish_date: '2026-06-12T00:00:00Z',
        level_start_sp: 0,
        level_end_sp: 1000,
        training_start_sp: 0,
      },
    ],
  },
  lastSyncedAt: NOW - 60_000,
  syncError: null,
};

describe('buildRosterCard', () => {
  it('joins name/portrait with the live totals and current-training derivation', () => {
    const vm = buildRosterCard(character, trainingLive, { '3327': 'Caldari Cruiser' }, NOW);
    expect(vm).toMatchObject({
      characterId: 91012740,
      name: 'Stormin Jr',
      needsReconnect: false,
      hasData: true,
      totalSp: 41_500_000,
      unallocatedSp: 405_000,
      currentSkillName: 'Caldari Cruiser',
    });
    expect(vm.training.kind).toBe('training');
    expect(vm.remainingLabel).not.toBeNull();
  });

  it('falls back to a null skill name when the id is unresolved', () => {
    const vm = buildRosterCard(character, trainingLive, {}, NOW);
    expect(vm.currentSkillName).toBeNull();
  });

  it('marks an unsynced character as having no data', () => {
    const vm = buildRosterCard({ ...character, needsReconnect: true }, undefined, {}, NOW);
    expect(vm).toMatchObject({
      hasData: false,
      totalSp: null,
      unallocatedSp: null,
      remainingLabel: null,
    });
    expect(vm.training).toEqual({ kind: 'empty' });
  });

  it('carries no remaining label for a paused queue', () => {
    const paused: RosterLiveData = {
      data: {
        totalSp: 8_600_000,
        entries: [{ skill_id: 3413, queue_position: 0, finished_level: 4 }],
      },
      lastSyncedAt: NOW,
      syncError: null,
    };
    const vm = buildRosterCard(character, paused, {}, NOW);
    expect(vm.training.kind).toBe('paused');
    expect(vm.remainingLabel).toBeNull();
  });
});
