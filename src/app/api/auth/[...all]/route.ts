import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/features/auth/auth';

// Better Auth's catch-all: login (EVE OAuth start + callback), sign-out, and
// get-session all mount under /api/auth/*. These are public auth endpoints —
// they establish identity rather than requiring it.
// authz: public
export const { GET, POST } = toNextJsHandler(auth);
