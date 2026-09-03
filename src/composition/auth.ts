import 'server-only';

import { identityProjectionRunners } from '@/composition/map-access-identity';
import { createAuth } from '@/platform/auth/auth';

export const auth = createAuth(identityProjectionRunners);
