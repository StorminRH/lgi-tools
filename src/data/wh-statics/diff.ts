import { codesBySystem, compareSystemCodes, type SystemCode } from './code-sets';
import type { WhStaticsDiff } from './schema';

function vocabulary(assignments: readonly SystemCode[]): Set<string> {
  return new Set(assignments.map((assignment) => assignment.code));
}

export function diffStatics(
  promoted: readonly SystemCode[],
  incoming: readonly SystemCode[],
): WhStaticsDiff {
  const systemsAdded: WhStaticsDiff['systemsAdded'][number][] = [];
  const systemsRemoved: WhStaticsDiff['systemsRemoved'][number][] = [];
  const systemsChanged: WhStaticsDiff['systemsChanged'][number][] = [];

  for (const comparison of compareSystemCodes(codesBySystem(promoted), codesBySystem(incoming))) {
    const { systemId } = comparison;
    if (comparison.kind === 'right-only') {
      systemsAdded.push({ systemId, codes: comparison.right });
    } else if (comparison.kind === 'left-only') {
      systemsRemoved.push({ systemId, codes: comparison.left });
    } else if (comparison.kind === 'different') {
      systemsChanged.push({ systemId, before: comparison.left, after: comparison.right });
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
