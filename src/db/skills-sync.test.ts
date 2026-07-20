import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getSkillsForCharacters: vi.fn(),
  getTypeNames: vi.fn(),
  listLinkedCharacters: vi.fn(),
  readCharacterSyncState: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));

vi.mock('@/features/auth/linked-characters', () => ({
  listLinkedCharacters: mocks.listLinkedCharacters,
}));

vi.mock('@/features/skill-queue/queries', () => ({
  getCharacterSkillLevels: vi.fn(),
  getSkillLevelsForCharacters: vi.fn(),
  getSkillsForCharacters: mocks.getSkillsForCharacters,
  readCharacterSyncState: mocks.readCharacterSyncState,
  saveCharacterSkills: vi.fn(),
  stampCharacterFresh: vi.fn(),
}));

vi.mock('@/data/eve-data/queries', () => ({
  getTypeNames: mocks.getTypeNames,
}));

import { getSkillsForUserOnView } from './skills-sync';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSkillsForUserOnView', () => {
  it('resolves the distinct queued skill names through the real view seam', async () => {
    const firstStamp = new Date('2026-07-20T12:00:00Z');
    mocks.listLinkedCharacters.mockResolvedValue([
      { characterId: 101 },
      { characterId: 202 },
      { characterId: 303 },
    ]);
    mocks.getSkillsForCharacters.mockResolvedValue(
      new Map([
        [
          101,
          {
            entries: [
              { skill_id: 3300, queue_position: 0, finished_level: 4 },
              { skill_id: 4400, queue_position: 1, finished_level: 5 },
            ],
            totalSp: 1_000_000,
          },
        ],
        [
          202,
          {
            entries: [{ skill_id: 3300, queue_position: 0, finished_level: 5 }],
            totalSp: 2_000_000,
          },
        ],
      ]),
    );
    mocks.readCharacterSyncState.mockImplementation(async (characterId: number) =>
      characterId === 101
        ? { lastRefreshedAt: firstStamp, queueEtag: 'queue-101', skillsEtag: 'skills-101' }
        : null,
    );
    mocks.getTypeNames.mockResolvedValue(
      new Map([
        [3300, 'Industry'],
        [4400, 'Advanced Industry'],
      ]),
    );

    const result = await getSkillsForUserOnView('user-1');

    expect(mocks.getSkillsForCharacters).toHaveBeenCalledWith([101, 202, 303]);
    expect(mocks.readCharacterSyncState).toHaveBeenCalledTimes(3);
    expect(mocks.getTypeNames).toHaveBeenCalledWith([3300, 4400]);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      characters: [
        {
          characterId: 101,
          data: {
            entries: [
              { skill_id: 3300, queue_position: 0, finished_level: 4 },
              { skill_id: 4400, queue_position: 1, finished_level: 5 },
            ],
            totalSp: 1_000_000,
          },
          lastRefreshedAt: firstStamp.getTime(),
        },
        {
          characterId: 202,
          data: {
            entries: [{ skill_id: 3300, queue_position: 0, finished_level: 5 }],
            totalSp: 2_000_000,
          },
          lastRefreshedAt: null,
        },
        { characterId: 303, data: null, lastRefreshedAt: null },
      ],
      names: { '3300': 'Industry', '4400': 'Advanced Industry' },
    });
  });

  it('still performs the shared name pass when no queued skills exist', async () => {
    mocks.listLinkedCharacters.mockResolvedValue([{ characterId: 101 }, { characterId: 202 }]);
    mocks.getSkillsForCharacters.mockResolvedValue(
      new Map([
        [101, { entries: [], totalSp: 1_000_000 }],
      ]),
    );
    mocks.readCharacterSyncState.mockResolvedValue(null);
    mocks.getTypeNames.mockResolvedValue(new Map());

    const result = await getSkillsForUserOnView('user-1');

    expect(mocks.getTypeNames).toHaveBeenCalledWith([]);
    expect(result.names).toEqual({});
    expect(result.characters).toEqual([
      {
        characterId: 101,
        data: { entries: [], totalSp: 1_000_000 },
        lastRefreshedAt: null,
      },
      { characterId: 202, data: null, lastRefreshedAt: null },
    ]);
  });
});
