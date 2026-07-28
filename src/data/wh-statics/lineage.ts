import { readFileSync } from 'node:fs';
import path from 'node:path';

/** One Pathfinder lineage assignment: a system id paired with a wormhole type id. */
export type LineageRow = {
  systemId: number;
  typeId: number;
};

const FIXTURE_PATH = path.join(
  import.meta.dirname,
  '__fixtures__/pathfinder-system-static.csv',
);

/**
 * Parses the committed Pathfinder `system_static.csv` fixture into lineage rows.
 * Skips `#` provenance comments and the `id;systemId;typeId` header.
 */
export function parseLineageCsv(csv: string): LineageRow[] {
  const rows: LineageRow[] = [];
  for (const rawLine of csv.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line === 'id;systemId;typeId') continue;
    const parts = line.split(';');
    if (parts.length !== 3) {
      throw new Error(`Malformed lineage row: ${rawLine}`);
    }
    const systemId = Number(parts[1]);
    const typeId = Number(parts[2]);
    if (!Number.isInteger(systemId) || !Number.isInteger(typeId)) {
      throw new Error(`Non-integer lineage row: ${rawLine}`);
    }
    rows.push({ systemId, typeId });
  }
  return rows;
}

/**
 * Reads and parses the committed Pathfinder MIT lineage fixture co-located under
 * `__fixtures__/`. Bootstrap and cross-check only — never a runtime network source.
 */
export function readLineageFixture(
  fixturePath: string = FIXTURE_PATH,
): LineageRow[] {
  return parseLineageCsv(readFileSync(fixturePath, 'utf8'));
}
