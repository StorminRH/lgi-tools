export function isLocalBaseUrl(baseUrl) {
  try {
    const { protocol, hostname, username, password } = new URL(baseUrl);
    return ['http:', 'https:'].includes(protocol) && !username && !password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
}

export function remoteSkipSeedError({
  baseUrl,
  skipSeed,
  e2eStorageState,
  uxStorageState,
}) {
  try {
    const target = new URL(baseUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      return 'E2E target must be an HTTP(S) URL without embedded credentials';
    }
  } catch {
    return 'E2E target must be an absolute HTTP(S) URL';
  }
  if (isLocalBaseUrl(baseUrl)) return null;
  if (!skipSeed) return 'Synthetic E2E seeding is forbidden for a remote target; use E2E_SKIP_SEED=1 with operator storage';
  if (e2eStorageState?.trim() || uxStorageState?.trim()) return null;
  return (
    'remote E2E with E2E_SKIP_SEED=1 requires E2E_STORAGE_STATE or UX_STORAGE_STATE ' +
    '(do not fall back to the local seed file against a remote deployment)'
  );
}
