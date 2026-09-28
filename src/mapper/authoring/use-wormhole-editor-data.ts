'use client';

import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';
import { useSystemStaticCodes } from '@/data/wh-statics/use-system-static-codes';
import { useWormholeCodex } from '../signatures/use-system-statics';

export interface WormholeEditorData {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly codexReady: boolean;
}

export function useWormholeCodexData(code: string | null): {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
  readonly codexReady: boolean;
} {
  const codex = useWormholeCodex();

  return {
    codex,
    codes: codex?.codes() ?? [],
    entry: codex === null || code === null ? null : codex.byCode(code),
    codexReady: codex !== null,
  };
}

export function useWormholeEditorData(
  systemId: number,
  code: string | null,
): WormholeEditorData {
  const codexState = useWormholeCodexData(code);
  const preferredCodes = useSystemStaticCodes(systemId);

  return {
    ...codexState,
    preferredCodes,
  };
}
