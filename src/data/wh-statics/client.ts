'use client';

import { apiFetch } from '@/transport/api-client';
import { systemStaticsEndpoint } from './api-contract';

/** Loads one origin system's promoted statics; transport failure stays explicit. */
export async function loadSystemStatics(
  systemId: number,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const result = await apiFetch(systemStaticsEndpoint, {
    params: { systemId },
    signal,
  });
  if (!result.ok) {
    const reason = 'status' in result ? result.status : result.kind;
    throw new Error(`system statics ${reason}`);
  }
  return result.data.statics;
}
