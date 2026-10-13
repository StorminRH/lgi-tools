import { db } from '@/db';
import { userRowsContributor } from '@/platform/purge/contributors';
import { industryProfiles, savedPlans } from './schema';

export const savedPlansPurgeContributor = userRowsContributor(db, {
  name: 'saved-plans',
  table: savedPlans,
  merge: { rule: 'rekey' },
});

// Members that are unlinked stay on the profile as unresolved references, the
// same way a saved plan keeps its build character, so no purgeCharacter hook.
export const industryProfilesPurgeContributor = userRowsContributor(db, {
  name: 'industry-profiles',
  table: industryProfiles,
  merge: { rule: 'rekey' },
});
