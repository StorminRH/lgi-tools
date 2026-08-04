import { apiFetch } from '@/transport/api-client';
import {
  adjacencyEndpoint,
  systemDirectoryEndpoint,
  universeAssetManifestEndpoint,
  wormholeCodexEndpoint,
} from './api-contract';
import type {
  SystemDirectoryEntry,
  WormholeCodexEntry,
} from './universe-assets';

/** Session-loaded system directory and stargate graph exposed through typed lookups. */
export interface UniverseAssets {
  version: string;
  systemInfo(id: number): SystemDirectoryEntry | null;
  neighbours(id: number): readonly number[];
}

/** Session-loaded wormhole type codex exposed through a code lookup. */
export interface WormholeCodex {
  version: string;
  byCode(code: string): WormholeCodexEntry | null;
  /** Sorted type codes (including K162) for type-ahead search. */
  codes(): readonly string[];
}

let universeAssetsPromise: Promise<UniverseAssets> | null = null;
let wormholeCodexPromise: Promise<WormholeCodex> | null = null;

function failureLabel(
  result: { ok: false; kind: string; status?: number },
): string {
  return result.status === undefined
    ? result.kind
    : `${result.kind} ${result.status}`;
}

async function loadManifestVersion(): Promise<string> {
  const result = await apiFetch(universeAssetManifestEndpoint);
  if (!result.ok) {
    throw new Error(`universe asset manifest ${failureLabel(result)}`);
  }
  return result.data.version;
}

async function fetchUniverseAssets(
  version: string,
): Promise<UniverseAssets | null> {
  const [systemsResult, adjacencyResult] = await Promise.all([
    apiFetch(systemDirectoryEndpoint, { params: { version } }),
    apiFetch(adjacencyEndpoint, { params: { version } }),
  ]);
  if (
    !systemsResult.ok &&
    (!('status' in systemsResult) || systemsResult.status !== 404)
  ) {
    throw new Error(`universe assets ${failureLabel(systemsResult)}`);
  }
  if (
    !adjacencyResult.ok &&
    (!('status' in adjacencyResult) || adjacencyResult.status !== 404)
  ) {
    throw new Error(`universe assets ${failureLabel(adjacencyResult)}`);
  }
  if (!systemsResult.ok || !adjacencyResult.ok) return null;

  const systemById = new Map(
    systemsResult.data.systems.map((system) => [system.id, system]),
  );
  const neighboursById = new Map(adjacencyResult.data.adjacency);
  return {
    version,
    systemInfo(id) {
      return systemById.get(id) ?? null;
    },
    neighbours(id) {
      return neighboursById.get(id) ?? [];
    },
  };
}

async function fetchWormholeCodex(
  version: string,
): Promise<WormholeCodex | null> {
  const result = await apiFetch(wormholeCodexEndpoint, {
    params: { version },
  });
  if (!result.ok) {
    if ('status' in result && result.status === 404) return null;
    throw new Error(`wormhole codex ${failureLabel(result)}`);
  }
  // The SDE ships multiple typeIds that share one code (e.g. C729 × 27) with
  // identical dogma. Keep every typeId→code pair available via the wire
  // payload for statics/lineage, but collapse the typeahead vocabulary to one
  // entry per code (lowest typeId wins for byCode).
  const typeByCode = new Map<string, (typeof result.data.types)[number]>();
  for (const entry of result.data.types) {
    const existing = typeByCode.get(entry.code);
    if (existing === undefined || entry.typeId < existing.typeId) {
      typeByCode.set(entry.code, entry);
    }
  }
  const codes = [...typeByCode.keys()].toSorted();
  return {
    version,
    byCode(code) {
      return typeByCode.get(code) ?? null;
    },
    codes() {
      return codes;
    },
  };
}

async function loadUniverseAssetsFresh(): Promise<UniverseAssets> {
  let version = await loadManifestVersion();
  let assets = await fetchUniverseAssets(version);
  if (assets !== null) return assets;

  version = await loadManifestVersion();
  assets = await fetchUniverseAssets(version);
  if (assets === null) {
    throw new Error('universe assets remained stale after one manifest refresh');
  }
  return assets;
}

async function loadWormholeCodexFresh(): Promise<WormholeCodex> {
  let version = await loadManifestVersion();
  let codex = await fetchWormholeCodex(version);
  if (codex !== null) return codex;

  version = await loadManifestVersion();
  codex = await fetchWormholeCodex(version);
  if (codex === null) {
    throw new Error('wormhole codex remained stale after one manifest refresh');
  }
  return codex;
}

/** Loads and memoizes the system directory plus adjacency graph once per browser session. */
export function loadUniverseAssets(): Promise<UniverseAssets> {
  if (universeAssetsPromise === null) {
    universeAssetsPromise = loadUniverseAssetsFresh().catch((error: unknown) => {
      universeAssetsPromise = null;
      throw error;
    });
  }
  return universeAssetsPromise;
}

/** Loads and memoizes the wormhole codex once per browser session. */
export function loadWormholeCodex(): Promise<WormholeCodex> {
  if (wormholeCodexPromise === null) {
    wormholeCodexPromise = loadWormholeCodexFresh().catch((error: unknown) => {
      wormholeCodexPromise = null;
      throw error;
    });
  }
  return wormholeCodexPromise;
}
