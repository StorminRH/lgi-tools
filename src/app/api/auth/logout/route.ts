import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/features/auth/cookies';

// POST-only on purpose — prevents accidental logout via link prefetch.
// The LoginButton submits a small <form method="POST"> here.
export async function POST(request: NextRequest): Promise<Response> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.redirect(new URL('/', request.url), 302);
}
