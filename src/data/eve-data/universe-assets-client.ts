import { createClientResource } from '@/lib/client-resource';
import { apiFetch } from '@/transport/api-client';
import { apiFailureLabel, apiFetchData } from '@/transport/api-fetch-data';
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
import { buildHubJumpIndex, type HubJumpTuple } from './trade-hubs';
import { indexWormholeCodex } from './wormhole-codex-index';
import type { WormholeEffect } from './wormhole-contract';
import type { WormholeEffectEntry } from './wormhole-effects';

export interface UniverseAssets {
  version: string;
  systemInfo(id: number): SystemDirectoryEntry | null;
  neighbours(id: number): readonly number[];
  hubJumps(id: number): HubJumpTuple;
}

export interface WormholeCodex {
  version: string;
  byCode(code: string): WormholeCodexEntry | null;
  codes(): readonly string[];
  /** The effect's modifiers at a wormhole class, or null when the SDE has none. */
  effect(effect: WormholeEffect, wormholeClass: number): WormholeEffectEntry | null;
}

/** Looks a system up in the loaded universe assets. */
export type SystemInfoLookup = UniverseAssets['systemInfo'];

async function loadManifestVersion(): Promise<string> {
  return (await apiFetchData(universeAssetManifestEndpoint, 'universe asset manifest')).version;
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
    throw new Error(`universe assets ${apiFailureLabel(systemsResult)}`);
  }
  if (
    !adjacencyResult.ok &&
    (!('status' in adjacencyResult) || adjacencyResult.status !== 404)
  ) {
    throw new Error(`universe assets ${apiFailureLabel(adjacencyResult)}`);
  }
  if (!systemsResult.ok || !adjacencyResult.ok) return null;

  const systemById = new Map(
    systemsResult.data.systems.map((system) => [system.id, system]),
  );
  const neighboursById = new Map(adjacencyResult.data.adjacency);
  const hubJumpsOf = buildHubJumpIndex((id) => neighboursById.get(id) ?? []);
  return {
    version,
    systemInfo(id) {
      return systemById.get(id) ?? null;
    },
    neighbours(id) {
      return neighboursById.get(id) ?? [];
    },
    hubJumps(id) {
      return hubJumpsOf(id);
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
    throw new Error(`wormhole codex ${apiFailureLabel(result)}`);
  }
  const codex = indexWormholeCodex(result.data.types);
  const effectByKey = new Map(
    (result.data.effects ?? []).map((entry) => [`${entry.effect}:${entry.wormholeClass}`, entry]),
  );
  return {
    version,
    byCode(code) {
      return codex.byCode(code);
    },
    codes() {
      return codex.codes;
    },
    effect(effect, wormholeClass) {
      return effectByKey.get(`${effect}:${wormholeClass}`) ?? null;
    },
  };
}

async function loadVersionedAsset<T>(
  load: (version: string) => Promise<T | null>,
  staleMessage: string,
): Promise<T> {
  let version = await loadManifestVersion();
  let value = await load(version);
  if (value !== null) return value;
  version = await loadManifestVersion();
  value = await load(version);
  if (value === null) throw new Error(staleMessage);
  return value;
}

/** The universe assets for this page, loaded once by the first reader or caller. */
export const universeAssetsResource = createClientResource(() =>
  loadVersionedAsset(fetchUniverseAssets, 'universe assets remained stale after one manifest refresh'),
);

/** The wormhole codex for this page, loaded once by the first reader or caller. */
export const wormholeCodexResource = createClientResource(() =>
  loadVersionedAsset(fetchWormholeCodex, 'wormhole codex remained stale after one manifest refresh'),
);

export function loadUniverseAssets(): Promise<UniverseAssets> {
  return universeAssetsResource.load();
}

export function loadWormholeCodex(): Promise<WormholeCodex> {
  return wormholeCodexResource.load();
}
