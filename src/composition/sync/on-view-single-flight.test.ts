import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => ({
  skills: vi.fn(),
  jobs: vi.fn(),
  corpJobs: vi.fn(),
  corpContext: vi.fn(),
  ownedAssets: vi.fn(),
  characterAssets: vi.fn(),
  ownedBlueprints: vi.fn(),
  sheets: vi.fn(),
}));

vi.mock('next/server', () => ({ after: vi.fn(), connection: vi.fn() }));
vi.mock('@/features/skill-queue/refresh', () => ({ refreshSkillsForUser: refresh.skills }));
vi.mock('@/features/industry-jobs/refresh', () => ({ refreshJobsForUser: refresh.jobs }));
vi.mock('@/features/industry-jobs/corp-refresh', () => ({ refreshCorpJobsForUser: refresh.corpJobs }));
vi.mock('@/data/corp-holdings/context-sync', () => ({ refreshCorpContextForUser: refresh.corpContext }));
vi.mock('@/features/owned-assets/refresh', () => ({
  refreshOwnedAssetsForUser: refresh.ownedAssets,
  refreshCharacterOwnedAssetsForUser: refresh.characterAssets,
}));
vi.mock('@/features/owned-blueprints/refresh', () => ({ refreshOwnedBlueprintsForUser: refresh.ownedBlueprints }));
vi.mock('@/features/character-sheet/refresh', () => ({ refreshCharacterSheetForUser: refresh.sheets }));

import { refreshCharacterSheetsOnView } from './character-sheet-sync';
import { refreshCorpContextOnView } from './corp-context-sync';
import { refreshCorpJobsOnView } from './corp-industry-jobs-sync';
import { refreshJobsOnView } from './industry-jobs-sync';
import { refreshCharacterAssetsOnView, refreshOwnedAssetsOnView } from './owned-assets-sync';
import { refreshOwnedBlueprintsOnView } from './owned-blueprints-sync';
import { refreshSkillsOnView } from './skills-sync';

const ON_VIEW = [
  ['refreshSkillsOnView', refreshSkillsOnView, refresh.skills],
  ['refreshJobsOnView', refreshJobsOnView, refresh.jobs],
  ['refreshCorpJobsOnView', refreshCorpJobsOnView, refresh.corpJobs],
  ['refreshCorpContextOnView', refreshCorpContextOnView, refresh.corpContext],
  ['refreshOwnedAssetsOnView', refreshOwnedAssetsOnView, refresh.ownedAssets],
  ['refreshCharacterAssetsOnView', refreshCharacterAssetsOnView, refresh.characterAssets],
  ['refreshOwnedBlueprintsOnView', refreshOwnedBlueprintsOnView, refresh.ownedBlueprints],
  ['refreshCharacterSheetsOnView', refreshCharacterSheetsOnView, refresh.sheets],
] as const;

/** Each underlying refresh call gets its own pending answer, settled by the test. */
function pendingRuns(underlying: (typeof ON_VIEW)[number][2]): Array<PromiseWithResolvers<unknown>> {
  const runs: Array<PromiseWithResolvers<unknown>> = [];
  underlying.mockImplementation(() => {
    const run = Promise.withResolvers<unknown>();
    runs.push(run);
    return run.promise;
  });
  return runs;
}

const usersOf = (underlying: (typeof ON_VIEW)[number][2]) => underlying.mock.calls.map((call) => call[1]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(ON_VIEW)('%s shares one in-flight refresh per user', (_name, onView, underlying) => {
  it('runs the refresh once for concurrent calls by the same user, and hands each caller its answer', async () => {
    const runs = pendingRuns(underlying);

    const first = onView('u1');
    const second = onView('u1');

    expect(usersOf(underlying)).toEqual(['u1']);
    runs[0]!.resolve(['done']);
    await expect(Promise.all([first, second])).resolves.toEqual([['done'], ['done']]);
  });

  it('runs it again for a call made after the first has settled, even one that failed', async () => {
    const runs = pendingRuns(underlying);

    const first = onView('u1');
    runs[0]!.reject(new Error('neon unavailable'));
    await expect(first).rejects.toThrow('neon unavailable');
    const second = onView('u1');
    runs[1]!.resolve([]);
    await second;

    expect(usersOf(underlying)).toEqual(['u1', 'u1']);
  });

  it('runs it once per user when two users call at once', async () => {
    const runs = pendingRuns(underlying);

    const calls = [onView('u1'), onView('u2')];
    for (const run of runs) run.resolve([]);
    await Promise.all(calls);

    expect(usersOf(underlying)).toEqual(['u1', 'u2']);
  });
});
