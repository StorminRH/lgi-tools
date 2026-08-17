import {
  effectiveWormholeClassId,
  FAR_SIDE_WORMHOLE_CODE,
  hintAdmitsClass,
  WORMHOLE_SIZE_CLASSES,
  wormholeSizeClass,
  type WormholeDestinationHint,
  type WormholeSizeClass,
  type WormholeSystemClassFacts,
} from '@/data/eve-data/wormhole-contract';
import type {
  TypedWormholeCodexEntry,
  WormholeCodexEntry,
} from '@/data/eve-data/universe-assets';

/** One unresolved hole in the system you jumped from, eligible for matching. */
export interface HoleMatchCandidate {
  readonly id: string;
  readonly wormholeTypeCode: string | null;
  readonly destinationHint?: WormholeDestinationHint;
  readonly sizeClass: WormholeSizeClass | null;
}

/** Plain cross-store evidence consumed by the pure jump matcher. */
export interface JumpEvidence {
  /** System you jumped from. */
  readonly origin: WormholeSystemClassFacts;
  /** System you landed in. */
  readonly destination: WormholeSystemClassFacts;
  readonly observedShipMassKg: number | null;
  readonly candidates: readonly HoleMatchCandidate[];
  /**
   * Named types of every scanned hole in the system you jumped from —
   * resolved hallways included, so an outgoing static that already linked
   * still counts (the census asks whether the system is fully scanned, not
   * whether a hole is still unresolved).
   */
  readonly scannedTypeCodes: readonly string[];
  readonly staticTypeCodes: readonly string[];
  readonly codex: readonly WormholeCodexEntry[];
}

/** The pure decision handed to transactional jump authoring. */
export type JumpMatchOutcome =
  | {
      readonly kind: 'resolve';
      readonly candidateId: string;
      readonly provenance: 'jump-verified' | 'assumed';
      readonly survivors: readonly string[];
    }
  | { readonly kind: 'insert'; readonly survivors: readonly string[] };

type TypedClassVerdict = 'consistent' | 'contradicted' | 'unknown';

interface EvaluatedCandidate {
  readonly candidate: HoleMatchCandidate;
  readonly typedClassVerdict: TypedClassVerdict;
  readonly rank: number;
}

function typedEntry(
  candidate: HoleMatchCandidate,
  codexByCode: ReadonlyMap<string, WormholeCodexEntry>,
): TypedWormholeCodexEntry | null {
  if (candidate.wormholeTypeCode === null) return null;
  const entry = codexByCode.get(candidate.wormholeTypeCode);
  return entry !== undefined && !entry.farSide ? entry : null;
}

function typedClassVerdict(
  entry: TypedWormholeCodexEntry | null,
  destinationClassId: number | null,
): TypedClassVerdict {
  if (entry === null || destinationClassId === null) return 'unknown';
  return entry.targetClass === destinationClassId ? 'consistent' : 'contradicted';
}

function sizeAdmitsShip(
  candidate: HoleMatchCandidate,
  entry: TypedWormholeCodexEntry | null,
  observedShipMassKg: number | null,
): boolean {
  if (
    observedShipMassKg === null ||
    !Number.isFinite(observedShipMassKg) ||
    observedShipMassKg <= 0
  ) {
    return true;
  }
  if (entry !== null) return observedShipMassKg <= entry.maxJumpMass;
  if (candidate.sizeClass === null) return true;
  const requiredClass = wormholeSizeClass(observedShipMassKg);
  return (
    WORMHOLE_SIZE_CLASSES.indexOf(requiredClass) <=
    WORMHOLE_SIZE_CLASSES.indexOf(candidate.sizeClass)
  );
}

function candidateRank(
  candidate: HoleMatchCandidate,
  verdict: TypedClassVerdict,
): number {
  if (verdict === 'consistent') return 0;
  if (candidate.destinationHint !== undefined) return 1;
  if (candidate.wormholeTypeCode === null) return 2;
  return candidate.wormholeTypeCode === FAR_SIDE_WORMHOLE_CODE ? 3 : 2;
}

function requiresStaticsCensus(classId: number | null): boolean {
  return classId !== null && ((classId >= 1 && classId <= 6) || classId === 13);
}

function staticsCensusSatisfied(evidence: JumpEvidence): boolean {
  const originClassId = effectiveWormholeClassId(evidence.origin);
  if (evidence.staticTypeCodes.length === 0) {
    return originClassId !== null && !requiresStaticsCensus(originClassId);
  }

  const scannedCounts = new Map<string, number>();
  for (const scannedTypeCode of evidence.scannedTypeCodes) {
    scannedCounts.set(
      scannedTypeCode,
      (scannedCounts.get(scannedTypeCode) ?? 0) + 1,
    );
  }
  for (const staticTypeCode of evidence.staticTypeCodes) {
    const remaining = scannedCounts.get(staticTypeCode) ?? 0;
    if (remaining === 0) return false;
    scannedCounts.set(staticTypeCode, remaining - 1);
  }
  return true;
}

/**
 * Eliminates contradicted signatures, orders every credible survivor by its
 * evidence quality, and returns the one authoring decision. The matcher never
 * performs I/O and never asserts verified identity from ambiguity.
 */
export function matchJump(evidence: JumpEvidence): JumpMatchOutcome {
  const codexByCode = new Map(evidence.codex.map((entry) => [entry.code, entry]));
  const destinationClassId = effectiveWormholeClassId(evidence.destination);
  const survivors: EvaluatedCandidate[] = [];

  for (const candidate of evidence.candidates) {
    const entry = typedEntry(candidate, codexByCode);
    const verdict = typedClassVerdict(entry, destinationClassId);
    if (verdict === 'contradicted') continue;
    if (
      candidate.destinationHint !== undefined &&
      !hintAdmitsClass(candidate.destinationHint, evidence.destination)
    ) {
      continue;
    }
    if (!sizeAdmitsShip(candidate, entry, evidence.observedShipMassKg)) continue;
    survivors.push({
      candidate,
      typedClassVerdict: verdict,
      rank: candidateRank(candidate, verdict),
    });
  }

  survivors.sort(
    (left, right) =>
      left.rank - right.rank || left.candidate.id.localeCompare(right.candidate.id),
  );
  const survivorIds = survivors.map(({ candidate }) => candidate.id);
  const selected = survivors[0];
  if (selected === undefined) return { kind: 'insert', survivors: survivorIds };

  const jumpVerified =
    survivors.length === 1 &&
    selected.typedClassVerdict === 'consistent' &&
    staticsCensusSatisfied(evidence);
  return {
    kind: 'resolve',
    candidateId: selected.candidate.id,
    provenance: jumpVerified ? 'jump-verified' : 'assumed',
    survivors: survivorIds,
  };
}
