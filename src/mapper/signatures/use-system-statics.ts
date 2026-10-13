'use client';

import { useSystemStaticCodes } from '@/data/wh-statics/use-system-static-codes';
import { systemClassText } from '@/data/eve-data/system-identity';
import { isTypedCodexEntry } from '@/data/eve-data/wormhole-contract';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';
import { useWormholeCodex } from '@/data/eve-data/use-universe-assets';

export function destinationClassIdForCode(
  code: string,
  codex: WormholeCodex | null,
): number | null {
  const entry = codex?.byCode(code);
  return isTypedCodexEntry(entry) ? entry.targetClass : null;
}

export function staticClassForCode(
  code: string,
  codex: WormholeCodex | null,
): { readonly className: string; readonly whClassId: number } | null {
  const whClassId = destinationClassIdForCode(code, codex);
  if (whClassId === null) return null;
  const className = systemClassText(whClassId);
  if (className === null) return null;
  return { className, whClassId };
}

export function useSystemStaticSlots(systemId: number) {
  const codex = useWormholeCodex();
  const codes = useSystemStaticCodes(systemId);
  return codes.flatMap((code) => {
    const target = staticClassForCode(code, codex);
    return target === null ? [] : [{ code, ...target }];
  });
}
