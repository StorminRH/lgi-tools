import 'server-only';

import { proveCharacter } from '@/composition/account-lifecycle/owner-transfer';
import { identityProjectionRunners } from '@/composition/map-access-identity';
import { refreshAffiliationsAndReconcile } from '@/composition/map-affiliation-access';
import { createAuth } from '@/platform/auth/auth';

export const auth = createAuth({
  runners: identityProjectionRunners,
  refreshCharacterAffiliations: refreshAffiliationsAndReconcile,
  proveCharacter,
});
