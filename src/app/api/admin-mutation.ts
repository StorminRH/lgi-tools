import { checkAdminMutation, type SessionCheckResult } from '@/platform/auth/route-guards';
import { problemResponse } from '@/transport/api-response';

export type AdminSession = Extract<SessionCheckResult, { ok: true }>['session'];

export async function adminMutationGate(
  request: Request,
): Promise<{ ok: true; session: AdminSession } | { ok: false; response: Response }> {
  const gate = await checkAdminMutation(request);
  if (!gate.ok) return { ok: false, response: problemResponse(gate.failure) };
  return { ok: true, session: gate.session };
}
