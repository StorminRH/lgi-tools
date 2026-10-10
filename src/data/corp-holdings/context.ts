import { type CorpHoldingContext, fromHoldingNodes, type HangarDivision, type HoldingNode } from './placement';

export interface CorpProfile {
  readonly hqStationId: number | null;
  readonly divisionNames: Partial<Record<HangarDivision, string>>;
  readonly containerNames: Record<string, string>;
  readonly structureNames: Record<string, string>;
}

export interface MemberBase {
  readonly characterId: number;
  readonly baseId: number | null;
}

export type CorpContexts = ReadonlyMap<number, CorpHoldingContext>;

function namesById(names: Record<string, string>): ReadonlyMap<number, string> {
  return new Map(Object.entries(names).map(([id, name]) => [Number(id), name]));
}

export function buildCorpHoldingContext(
  corporationId: number,
  nodes: readonly HoldingNode[],
  profile: CorpProfile | null,
): CorpHoldingContext {
  const hqStationId = profile?.hqStationId ?? null;
  return {
    corporationId,
    index: fromHoldingNodes(nodes),
    hq: hqStationId === null ? { kind: 'unknown' } : { kind: 'known', value: hqStationId },
    divisionNames: profile?.divisionNames ?? {},
    containerNames: namesById(profile?.containerNames ?? {}),
    structureNames: namesById(profile?.structureNames ?? {}),
  };
}

export function corpContextOf(contexts: CorpContexts, corporationId: number): CorpHoldingContext {
  const context = contexts.get(corporationId);
  if (context === undefined) throw new Error(`No holding context for corporation ${corporationId}`);
  return context;
}
