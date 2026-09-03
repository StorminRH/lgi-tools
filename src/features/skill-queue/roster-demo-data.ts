import type { PanelCharacter } from '@/components/live-character-card';
import type { SkillQueueEntry } from './esi-projection';
import { buildRosterCard, type RosterLiveData, type RosterViewModel } from './roster-view-model';

const DEMO_NOW = Date.parse('2026-06-23T12:00:00Z');

const DEMO_NAMES: Record<string, string> = {
  '3327': 'Caldari Cruiser',
  '3402': 'Fuel Conservation',
  '3413': 'Amarr Starship Engineering',
  '12487': 'Advanced Medium Ship Construction',
  '24624': 'Caldari Battlecruiser',
};

function demoPortrait(characterId: number): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=64`;
}

interface DemoChar {
  panel: PanelCharacter;
  live: RosterLiveData | undefined;
}

function demoChars(now: number): DemoChar[] {
  const hour = 3_600_000;
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  return [
    {
      panel: { characterId: 91012740, name: 'Stormin Jr', portraitUrl: demoPortrait(91012740), needsReconnect: false },
      live: {
        data: {
          totalSp: 41_500_000,
          unallocatedSp: 405_000,
          entries: [
            {
              skill_id: 3327, queue_position: 0, finished_level: 5,
              start_date: iso(-60 * hour), finish_date: iso(24 * hour),
              level_start_sp: 0, level_end_sp: 256_000, training_start_sp: 0,
            } satisfies SkillQueueEntry,
            { skill_id: 24624, queue_position: 1, finished_level: 4 } satisfies SkillQueueEntry,
          ],
        },
        lastSyncedAt: now - 5 * 60_000,
        syncError: null,
      },
    },
    {
      panel: { characterId: 92034512, name: 'Karaka Haginen', portraitUrl: demoPortrait(92034512), needsReconnect: false },
      live: {
        data: {
          totalSp: 8_600_000,
          entries: [
            {
              skill_id: 3413, queue_position: 0, finished_level: 4,
              level_start_sp: 90_510, level_end_sp: 512_000, training_start_sp: 200_000,
            } satisfies SkillQueueEntry,
          ],
        },
        lastSyncedAt: now - 42 * 60_000,
        syncError: null,
      },
    },
    {
      panel: { characterId: 95465499, name: 'Nimrots Sarikusa', portraitUrl: demoPortrait(95465499), needsReconnect: false },
      live: {
        data: {
          totalSp: 28_300_000,
          entries: [
            {
              skill_id: 12487, queue_position: 0, finished_level: 5,
              start_date: iso(-6 * hour), finish_date: iso(9 * 24 * hour),
              level_start_sp: 0, level_end_sp: 1_280_000, training_start_sp: 0,
            } satisfies SkillQueueEntry,
          ],
        },
        lastSyncedAt: now - 2 * 60_000,
        syncError: null,
      },
    },
    {
      panel: { characterId: 93115006, name: 'Soren Galtier', portraitUrl: demoPortrait(93115006), needsReconnect: false },
      live: { data: { totalSp: 71_660_000, entries: [] }, lastSyncedAt: now - 12 * 60_000, syncError: null },
    },
    {
      panel: { characterId: 90400056, name: 'Freddy Confeti', portraitUrl: demoPortrait(90400056), needsReconnect: true },
      live: undefined,
    },
  ];
}

export function buildDemoRoster(single = false): RosterViewModel[] {
  const chars = demoChars(DEMO_NOW);
  return (single ? chars.slice(0, 1) : chars).map((c) =>
    buildRosterCard(c.panel, c.live, DEMO_NAMES, DEMO_NOW),
  );
}
