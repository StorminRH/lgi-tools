'use client';

import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';
import { useWormholeCodex } from '@/data/eve-data/use-universe-assets';
import { useSystemStaticCodes } from '@/data/wh-statics/use-system-static-codes';

/** One empty list while the codex loads, so memos keyed on `codes` hold. */
const EMPTY_CODES: readonly string[] = [];

export interface WormholeEditorData {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
}

export function useWormholeCodexData(code: string | null): {
  readonly codex: WormholeCodex | null;
  readonly codes: readonly string[];
  readonly entry: WormholeCodexEntry | null;
} {
  const codex = useWormholeCodex();

  return {
    codex,
    codes: codex?.codes() ?? EMPTY_CODES,
    entry: codex === null || code === null ? null : codex.byCode(code),
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
