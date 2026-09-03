import type { WhStaticsDiff } from './schema';

export interface WhStaticAssignment {
  readonly systemId: number;
  readonly code: string;
}

function codesBySystem(
  assignments: readonly WhStaticAssignment[],
): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const assignment of assignments) {
    const codes = result.get(assignment.systemId) ?? new Set<string>();
    codes.add(assignment.code);
    result.set(assignment.systemId, codes);
  }
  return result;
}

function sortedCodes(values: ReadonlySet<string>): string[] {
  return [...values].sort();
}

function sameCodes(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((code) => right.has(code));
}

function vocabulary(assignments: readonly WhStaticAssignment[]): Set<string> {
  return new Set(assignments.map((assignment) => assignment.code));
}

export function diffStatics(
  promoted: readonly WhStaticAssignment[],
  incoming: readonly WhStaticAssignment[],
): WhStaticsDiff {
  const promotedBySystem = codesBySystem(promoted);
  const incomingBySystem = codesBySystem(incoming);
  const systemsAdded: WhStaticsDiff['systemsAdded'][number][] = [];
  const systemsRemoved: WhStaticsDiff['systemsRemoved'][number][] = [];
  const systemsChanged: WhStaticsDiff['systemsChanged'][number][] = [];
  const systemIds = new Set([
    ...promotedBySystem.keys(),
    ...incomingBySystem.keys(),
  ]);

  for (const systemId of [...systemIds].sort((left, right) => left - right)) {
    const before = promotedBySystem.get(systemId);
    const after = incomingBySystem.get(systemId);
    if (before === undefined) {

      systemsAdded.push({ systemId, codes: sortedCodes(after!) });
    } else if (after === undefined) {
      systemsRemoved.push({ systemId, codes: sortedCodes(before) });
    } else if (!sameCodes(before, after)) {
      systemsChanged.push({
        systemId,
        before: sortedCodes(before),
        after: sortedCodes(after),
      });
    }
  }

  const promotedCodes = vocabulary(promoted);
  const incomingCodes = vocabulary(incoming);
  const codesAdded = [...incomingCodes]
    .filter((code) => !promotedCodes.has(code))
    .sort();
  const codesRemoved = [...promotedCodes]
    .filter((code) => !incomingCodes.has(code))
    .sort();

  return {
    systemsAdded,
    systemsRemoved,
    systemsChanged,
    codesAdded,
    codesRemoved,
    totalDifferences:
      systemsAdded.length + systemsRemoved.length + systemsChanged.length,
  };
}
