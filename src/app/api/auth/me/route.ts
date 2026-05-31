import { getSession, isAdmin } from '@/features/auth/session';

// No user input — session read from cookie. Returns the viewer's own identity
// and admin status so the client header can render login state without the root
// layout reading the cookie at render time (3.0.4.7). `isAdmin` is computed here,
// server-side, because its superadmin branch reads SUPERADMIN_CHARACTER_ID — an
// env var the client must never see. `no-store` keeps login state fresh across
// login/logout navigations.
// authz: public
export async function GET(): Promise<Response> {
  const session = await getSession();
  return Response.json(
    { session, isAdmin: isAdmin(session) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
