function isLocalBaseUrl(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1';
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
  if (!skipSeed) return null;
  if (isLocalBaseUrl(baseUrl)) return null;
  if (e2eStorageState || uxStorageState) return null;
  return (
    'remote E2E with E2E_SKIP_SEED=1 requires E2E_STORAGE_STATE or UX_STORAGE_STATE ' +
    '(do not fall back to the local seed file against a remote deployment)'
  );
}
