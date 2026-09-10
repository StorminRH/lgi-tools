import { SYNTHETIC_PILOT } from '@/platform/auth/synthetic-pilot';

export const E2E_CHARACTER_ID = SYNTHETIC_PILOT.characterId;
export const E2E_USER_ID = SYNTHETIC_PILOT.userId;
export const E2E_CHARACTER_NAME = SYNTHETIC_PILOT.name;

export const DEFAULT_STORAGE_STATE_PATH = 'docs/ux-check/captures/auth-storage.json';

export function resolveE2eStorageStatePath(): string {
  return process.env.E2E_STORAGE_STATE ?? process.env.UX_STORAGE_STATE ?? DEFAULT_STORAGE_STATE_PATH;
}

export function usesSyntheticE2ePilot(storageStatePath: string): boolean {
  const normalized = storageStatePath.replace(/\\/g, '/');
  return (
    normalized === DEFAULT_STORAGE_STATE_PATH ||
    normalized.endsWith(`/${DEFAULT_STORAGE_STATE_PATH}`)
  );
}
