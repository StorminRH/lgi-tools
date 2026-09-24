'use client';

import { apiFetch } from '@/transport/api-client';
import { systemStaticsEndpoint } from './api-contract';

const staticsBySystem = new Map<number, Promise<readonly string[]>>();

async function fetchSystemStatics(systemId: number): Promise<readonly string[]> {
  const result = await apiFetch(systemStaticsEndpoint, { params: { systemId } });
  if (!result.ok) {
    const reason = 'status' in result ? result.status : result.kind;
    throw new Error(`system statics ${reason}`);
  }
  return result.data.statics;
}

export function loadSystemStatics(systemId: number): Promise<readonly string[]> {
  const cached = staticsBySystem.get(systemId);
  if (cached !== undefined) return cached;
  const request = fetchSystemStatics(systemId).catch((error: unknown) => {
    staticsBySystem.delete(systemId);
    throw error;
  });
  staticsBySystem.set(systemId, request);
  return request;
}
