import { blobUnconfiguredFailure, uploadQuotaFailure, uploadRouteOptions } from '@/app/api/codex/pilot-route';
import { runMutationRoute } from '@/app/api/mutation-route';
import { codexUploadFinalizeEndpoint, codexUploadFinalizeRequestSchema } from '@/features/codex/api-contract';
import { finalizeCodexUpload, type CodexFinalizeResult } from '@/features/codex/asset-storage';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export const maxDuration = 60;

type Refusal = Exclude<CodexFinalizeResult['status'], 'created' | 'reused'>;

const REFUSALS: Record<Refusal, () => Response> = {
  'forbidden-key': () =>
    apiResponse(codexUploadFinalizeEndpoint, 400, validationFailure('forbidden_key', 'That upload is not yours to finish')),
  'not-image': () =>
    apiResponse(codexUploadFinalizeEndpoint, 400, validationFailure('not_an_image', 'That file is not an image.')),
  'too-large': () =>
    apiResponse(codexUploadFinalizeEndpoint, 400, validationFailure('too_large', 'Images can be at most 8 MB.')),
  'too-many-pixels': () =>
    apiResponse(
      codexUploadFinalizeEndpoint,
      400,
      validationFailure('too_many_pixels', 'That image is too large. Keep it under 24 megapixels.'),
    ),
  missing: () =>
    apiResponse(
      codexUploadFinalizeEndpoint,
      404,
      notFoundFailure('pending_upload_missing', 'The upload did not arrive. Try again.'),
    ),
  quota: () => apiResponse(codexUploadFinalizeEndpoint, 429, uploadQuotaFailure()),
  unconfigured: () => apiResponse(codexUploadFinalizeEndpoint, 503, blobUnconfiguredFailure()),
};

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, uploadRouteOptions(request, {
    capability: 'codex.finalize-image',
    limiter: 'codex-upload-finalize',
    parse: (incoming) => readJsonBody(incoming, codexUploadFinalizeRequestSchema),
    handle: async (submitter, body) => {
      const result = await finalizeCodexUpload({ url: body.url, ...submitter });
      if (result.status === 'created' || result.status === 'reused') {
        return apiResponse(codexUploadFinalizeEndpoint, 200, { asset: result.asset });
      }
      return REFUSALS[result.status]();
    },
  }));
}
