import type { BodyfulMutationOptions } from '@/app/api/mutation-route';
import { rateLimitPreflight } from '@/app/api/rate-limit-preflight';
import { checkSession } from '@/composition/route-guards';
import type { CapabilityId } from '@/data/telemetry/capability';
import type { CodexSubmitter } from '@/features/codex/proposals';
import { dependencyUnavailableFailure, forbiddenFailure, rateLimitedFailure } from '@/lib/failure';
import { problemResponse } from '@/transport/api-response';

export async function authorizeCodexPilot(detail: string) {
  const checked = await checkSession();
  if (!checked.ok) return checked;
  const { session } = checked;
  if (session.characterId == null) {
    return { ok: false as const, failure: forbiddenFailure('character_required', detail) };
  }
  const submitter: CodexSubmitter = { userId: session.user.id, characterId: session.characterId };
  return { ok: true as const, submitter };
}

export const uploadQuotaFailure = () =>
  rateLimitedFailure(3600, 'upload_quota', 'You can add 20 screenshots a day. Try again tomorrow.');

export const blobUnconfiguredFailure = () =>
  dependencyUnavailableFailure('blob_unconfigured', 503, { detail: 'Image storage is not configured' });

export function uploadRouteOptions<TBody>(
  request: Request,
  route: {
    capability: Extract<CapabilityId, `codex.${string}`>;
    limiter: string;
    parse: BodyfulMutationOptions<{ ok: true; submitter: CodexSubmitter }, TBody>['parse'];
    handle: (submitter: CodexSubmitter, body: TBody) => Promise<Response>;
  },
): BodyfulMutationOptions<{ ok: true; submitter: CodexSubmitter }, TBody> {
  return {
    capability: route.capability,
    preflight: rateLimitPreflight(request, { name: route.limiter, perMinute: 20 }, problemResponse),
    authorize: () => authorizeCodexPilot('Sign in with a character to add screenshots'),
    parse: route.parse,
    handle: ({ submitter }, body) => route.handle(submitter, body),
  };
}
