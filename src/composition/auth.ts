import 'server-only';

import { reconcileCharacterOwner } from '@/composition/account-lifecycle/owner-transfer';
import {
  identityProjectionRunners,
  refreshAffiliationsAndReproject,
} from '@/composition/map-access-identity';
import { createAuth } from '@/platform/auth/auth';

export const auth = createAuth({
  runners: identityProjectionRunners,
  reconcileCharacterOwner,
  refreshCharacterAffiliations: refreshAffiliationsAndReproject,
});
