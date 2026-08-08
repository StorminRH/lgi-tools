'use client';

import { useEffect, useState } from 'react';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  loadWormholeCodex,
  type WormholeCodex,
} from '@/data/eve-data/universe-assets-client';
import { loadSystemStatics } from '@/data/wh-statics/client';

/** Codex and origin-statics facts shared by every connection-field host. */
export interface WormholeEditorData {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly codexReady: boolean;
}

/** Session-memoized codex state shared by editors and row presentation. */
export function useWormholeCodexData(code: string | null): {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly codexReady: boolean;
} {
  const [codex, setCodex] = useState<WormholeCodex | null>(null);

  useEffect(() => {
    if (codex !== null) return;
    let alive = true;
    loadWormholeCodex().then(
      (loaded) => {
        if (alive) setCodex(loaded);
      },
      () => {
        // Degraded: the shared type field remains lenient and retries when the
        // edited code changes, matching the existing connection-card behavior.
      },
    );
    return () => {
      alive = false;
    };
  }, [codex, code]);

  return {
    codex,
    codes: codex?.codes() ?? [],
    entry: codex === null || code === null ? null : codex.byCode(code),
    codexReady: codex !== null,
  };
}

/** Loads the shared type vocabulary plus one connection origin's preferred statics. */
export function useWormholeEditorData(
  systemId: number,
  code: string | null,
): WormholeEditorData {
  const codexState = useWormholeCodexData(code);
  const [statics, setStatics] = useState<{
    readonly systemId: number;
    readonly codes: readonly string[];
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    loadSystemStatics(systemId, controller.signal).then(
      (statics) => {
        if (alive) setStatics({ systemId, codes: statics });
      },
      () => {
        // Degraded: an unavailable statics route means ordinary codex search,
        // never a fabricated assertion that this system has no statics.
      },
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [systemId]);

  return {
    ...codexState,
    preferredCodes: statics?.systemId === systemId ? statics.codes : [],
  };
}
