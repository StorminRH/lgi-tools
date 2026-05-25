import { getSession } from '@/features/auth/session';

export async function GET(): Promise<Response> {
  const session = await getSession();
  return Response.json(session);
}
