import { readFile } from 'node:fs/promises';

const PATHFINDER_FIXTURE = new URL(
  './__fixtures__/pathfinder-system-static.csv',
  import.meta.url,
);

/** One original Pathfinder system-static assignment. */
export interface PathfinderStaticRow {
  readonly systemId: number;
  readonly typeId: number;
}

/** Raised when the committed lineage CSV no longer matches its owned format. */
export class PathfinderLineageError extends Error {
  /** Creates a named fixture-format failure. */
  constructor(message: string) {
    super(message);
    this.name = 'PathfinderLineageError';
  }
}

function positiveInteger(raw: string, field: string, lineNumber: number): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PathfinderLineageError(
      `Invalid ${field} on Pathfinder line ${lineNumber}`,
    );
  }
  return value;
}

/**
 * Parses the semicolon-delimited Pathfinder lineage export after skipping its
 * auditable comment header, returning deterministic system/type ordering.
 */
export function parsePathfinderLineage(csv: string): PathfinderStaticRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const [header, ...rows] = lines;
  if (header !== 'id;systemId;typeId') {
    throw new PathfinderLineageError('Unexpected Pathfinder CSV header');
  }
  const parsed = rows.map((row, index) => {
    const columns = row.split(';');
    if (columns.length !== 3) {
      throw new PathfinderLineageError(
        `Unexpected Pathfinder column count on line ${index + 3}`,
      );
    }
    const [, systemId, typeId] = columns;
    return {
      systemId: positiveInteger(systemId ?? '', 'systemId', index + 3),
      typeId: positiveInteger(typeId ?? '', 'typeId', index + 3),
    };
  });
  return parsed.sort(
    (left, right) =>
      left.systemId - right.systemId || left.typeId - right.typeId,
  );
}

/** Reads and parses the committed MIT Pathfinder lineage fixture. */
export async function readPathfinderLineage(): Promise<PathfinderStaticRow[]> {
  return parsePathfinderLineage(await readFile(PATHFINDER_FIXTURE, 'utf8'));
}
