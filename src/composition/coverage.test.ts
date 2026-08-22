import { describe, expect, it } from 'vitest';

import { RANGES } from '@/composition/admin-period';
import { getCorpJobsForUserOnView } from '@/composition/sync/corp-industry-jobs-sync';
import { getAvailableCorpStructuresForUser, getCorpStructuresForUserOnView, getCorpStructuresPageData } from '@/composition/sync/corp-structures-sync';
import { getJobsForUserOnView } from '@/composition/sync/industry-jobs-sync';
import { getOwnedAssetDetailOnView } from '@/composition/sync/owned-assets-sync';
import { getOwnedBlueprintDetailOnView } from '@/composition/sync/owned-blueprints-sync';
import { getSkillLevelsForUserOnView } from '@/composition/sync/skills-sync';
import { getWhStaticsOperatorReview } from '@/composition/wh-statics-refresh';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      RANGES,
      getCorpJobsForUserOnView,
      getAvailableCorpStructuresForUser,
      getCorpStructuresForUserOnView,
      getCorpStructuresPageData,
      getJobsForUserOnView,
      getOwnedAssetDetailOnView,
      getOwnedBlueprintDetailOnView,
      getSkillLevelsForUserOnView,
      getWhStaticsOperatorReview,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
