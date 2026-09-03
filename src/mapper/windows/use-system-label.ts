'use client';

// Directory identity for window chrome. The current-system dock follows the
// tracked location even when Atlas has not drawn that system (k-space gates
// stay off the chain), so name and class/security must come from the session
// directory — the same source canvas labels already use — not from React Flow
// node data.
import { resolveSystemLabel, type SystemLabel } from '../chain/labels';
import { useUniverseAssets } from '../chain/use-universe-assets';

/**
 * Resolves one system's display label from the session directory.
 * `systemId === null` returns null; an unloaded or missing entry keeps the
 * existing HC-5 bare-id fallback inside {@link resolveSystemLabel}.
 */
export function useSystemLabel(systemId: number | null): SystemLabel | null {
  const assets = useUniverseAssets();
  if (systemId === null) return null;
  return resolveSystemLabel(systemId, assets?.systemInfo ?? null);
}
