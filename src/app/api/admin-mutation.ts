import { checkAdminMutation, type SessionCheckResult } from '@/composition/route-guards';
import { problemResponse } from '@/transport/api-response';

export type AdminSession = Extract<SessionCheckResult, { ok: true }>['session'];

/**
 * Admin form-mutation gate for routes that stay outside `runMutationRoute`.
 * Maps the shared admin + same-origin check to a problem response.
 */
export async function adminMutationGate(
  request: Request,
): Promise<{ ok: true; session: AdminSession } | { ok: false; response: Response }> {
  const gate = await checkAdminMutation(request);
  if (!gate.ok) return { ok: false, response: problemResponse(gate.failure) };
  return { ok: true, session: gate.session };
}
