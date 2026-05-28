import { getSession } from '@/features/auth/session';

// No user input — session read from cookie.
export async function GET(): Promise<Response> {
  const session = await getSession();
  return Response.json(session);
}
