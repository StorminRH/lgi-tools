/**
 * Side-effect-free E2E identity constants. Specs import this module so collecting
 * tests does not load Better Auth, Drizzle, or dotenv (those live in auth-seed).
 */

/** Obviously fake local character — never a real EVE id used in production. */
export const E2E_CHARACTER_ID = 9_000_001;
export const E2E_USER_ID = 'e2e-pilot';
export const E2E_CHARACTER_NAME = 'E2E Pilot';

/** Default Playwright storageState path written by `pnpm e2e:seed`. */
export const DEFAULT_STORAGE_STATE_PATH = 'docs/ux-check/captures/auth-storage.json';

/** Resolves storage state for authenticated specs (shell env only — not globalSetup). */
export function resolveE2eStorageStatePath(): string {
  return process.env.E2E_STORAGE_STATE ?? process.env.UX_STORAGE_STATE ?? DEFAULT_STORAGE_STATE_PATH;
}

/** True when the path is the local synthetic seed file (not an operator export). */
export function usesSyntheticE2ePilot(storageStatePath: string): boolean {
  const normalized = storageStatePath.replace(/\\/g, '/');
  return (
    normalized === DEFAULT_STORAGE_STATE_PATH ||
    normalized.endsWith(`/${DEFAULT_STORAGE_STATE_PATH}`)
  );
}
