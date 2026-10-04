import { blobUnconfiguredFailure, uploadQuotaFailure, uploadRouteOptions } from '@/app/api/codex/pilot-route';
import { runMutationRoute } from '@/app/api/mutation-route';
import { codexUploadTokenEndpoint, codexUploadTokenRequestSchema } from '@/features/codex/api-contract';
import { readUploadQuota } from '@/features/codex/assets';
import { CODEX_UPLOAD_CONTENT_TYPES, CODEX_UPLOAD_LIMITS, CODEX_UPLOAD_MAX_BYTES } from '@/features/codex/constants';
import { codexBlobEnv, isAllowedUploadPathname, issueCodexUpload, pendingPrefix } from '@/lib/codex-blob';
import { validationFailure } from '@/lib/failure';
import { rateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const TOKEN_LIFETIME_MS = 10 * 60 * 1000;

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, uploadRouteOptions(request, {
    capability: 'codex.upload-image',
    limiter: 'codex-upload',
    parse: (incoming) => readJsonBody(incoming, codexUploadTokenRequestSchema),
    handle: async (submitter, body) => {
      if (!isAllowedUploadPathname(body.payload.pathname, pendingPrefix(codexBlobEnv(), submitter.userId))) {
        return apiResponse(
          codexUploadTokenEndpoint,
          400,
          validationFailure('bad_pathname', 'Uploads go under your own pending folder'),
        );
      }
      if (
        (await readUploadQuota(submitter.userId)) >= CODEX_UPLOAD_LIMITS.perDay ||
        !(await rateLimit(submitter.userId, { name: 'codex-upload-tokens', perDay: CODEX_UPLOAD_LIMITS.perDay })).ok
      ) {
        return apiResponse(codexUploadTokenEndpoint, 429, uploadQuotaFailure());
      }
      const issued = await issueCodexUpload(request, body, {
        allowedContentTypes: [...CODEX_UPLOAD_CONTENT_TYPES],
        maximumSizeInBytes: CODEX_UPLOAD_MAX_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + TOKEN_LIFETIME_MS,
      });
      if (issued.status === 'unconfigured') {
        return apiResponse(codexUploadTokenEndpoint, 503, blobUnconfiguredFailure());
      }
      return apiResponse(codexUploadTokenEndpoint, 200, { type: issued.type, clientToken: issued.clientToken });
    },
  }));
}
