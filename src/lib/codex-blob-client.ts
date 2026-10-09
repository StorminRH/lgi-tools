import { handleUpload, upload, type HandleUploadBody } from '@vercel/blob/client';

export type CodexUploadBody = HandleUploadBody;

export interface CodexUploadTokenOptions {
  readonly allowedContentTypes: string[];
  readonly maximumSizeInBytes: number;
  readonly addRandomSuffix: true;
  readonly validUntil: number;
}

export async function uploadCodexBlob(pathname: string, blob: Blob, handleUploadUrl: string): Promise<string> {
  const result = await upload(pathname, blob, { access: 'public', handleUploadUrl, contentType: blob.type });
  return result.url;
}

export async function issueCodexUploadToken(input: {
  request: Request;
  body: CodexUploadBody;
  token: string;
  options: CodexUploadTokenOptions;
}): Promise<{ readonly type: string; readonly clientToken: string }> {
  const result = await handleUpload({
    token: input.token,
    request: input.request,
    body: input.body,
    onBeforeGenerateToken: async () => ({ ...input.options }),
  });
  if (!('clientToken' in result)) throw new Error('Vercel Blob answered a token request without a client token');
  return { type: result.type, clientToken: result.clientToken };
}
