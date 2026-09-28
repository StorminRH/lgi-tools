import { type CorpHoldingContext, fromHoldingNodes, type HangarDivision, type HoldingNode } from './placement';

/** The Director-token context the corp_context pass writes to corp_profiles. */
export interface CorpProfile {
  readonly hqStationId: number | null;
  readonly divisionNames: Partial<Record<HangarDivision, string>>;
  readonly containerNames: Record<string, string>;
  readonly structureNames: Record<string, string>;
  readonly pageEtags: string[];
}

export type CorpProfileRow = Omit<CorpProfile, 'pageEtags'>;

function namesById(names: Record<string, string>): ReadonlyMap<number, string> {
  return new Map(Object.entries(names).map(([id, name]) => [Number(id), name]));
}

/** No profile row yet (the Director has not run a context pass) leaves the HQ unknown, which fails closed. */
export function buildCorpHoldingContext(
  corporationId: number,
  nodes: readonly HoldingNode[],
  profile: CorpProfileRow | null,
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
