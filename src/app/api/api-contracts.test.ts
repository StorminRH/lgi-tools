import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Mechanical API-contract completeness gate (3.9.2.4) — expands the 3.4.T
// presence check. For every src/app/api/**/route.* file this asserts:
//   1. it imports from its owning slice's api-contract module (unchanged);
//   2. it either consumes a contract Zod schema through route-body.ts
//      (parseJsonBody/parseFormBody — directly or via the mutation pipeline's
//      parse option) or declares exactly one closed-vocabulary input marker:
//        // input: none | query
//      — never both: a marker on a schema-consuming route would lie;
//   3. if it builds a JSON payload in-route (.json( appears), at least one
//      `satisfies` pins the payload to an identifier imported from the
//      contract module (cron routes delegate to defineCronRoute<T>, redirect
//      routes return no JSON — both exempt by construction).
// The checks are pure functions over route source, unit-tested below with
// seeded-violation fixtures (the gate's own red evidence). Semantic drift
// remains pnpm typecheck's job, as before.

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

// An import (or export) whose specifier ends in `api-contract`.
const CONTRACT_IMPORT_RE = /from\s+['"][^'"]*api-contract['"]/;
const CONTRACT_NAMED_IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*api-contract['"]/g;
const INPUT_MARKER_RE = /^[ \t]*\/\/[ \t]*input:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_INPUT_CLASSES = new Set(['none', 'query']);
const SCHEMA_CONSUMPTION_RE = /\bparse(?:Json|Form)Body\b/;
const JSON_RESPONSE_RE = /\.json\(/;
const RESPONSE_PIN_RE = /\bsatisfies\s+([A-Za-z_$][\w$]*)/g;

// Routes whose wire shapes are owned by a library, not by us. The better-auth
// catch-all's contract IS the better-auth version in package.json; the two
// endpoints we call directly are hand-pinned in features/auth/api-contract.ts.
const LIBRARY_OWNED = new Set(['auth/[...all]/route.ts']);

// Recursive walk using withFileTypes only — `fs.globSync` and the `recursive`
// readdir option are absent from the pinned @types/node@20 and would break
// `pnpm typecheck` even though Node 24 runs them.
function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (/^route\.(ts|js|mts|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const ROUTE_FILES = findRouteFiles(API_DIR).filter(
  (file) => !LIBRARY_OWNED.has(relative(API_DIR, file)),
);
const label = (file: string) => relative(REPO_ROOT, file);

function hasSchemaConsumption(source: string): boolean {
  return SCHEMA_CONSUMPTION_RE.test(source);
}

function findInputMarkers(source: string): string[] {
  return [...source.matchAll(INPUT_MARKER_RE)].map((match) => match[1]!);
}

function contractImportedNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(CONTRACT_NAMED_IMPORT_RE)) {
    for (const specifier of match[1]!.split(',')) {
      const declaration = specifier.trim().replace(/^type\s+/, '');
      const alias = declaration.match(/\bas\s+([A-Za-z_$][\w$]*)$/)?.[1];
      const original = declaration.match(/^([A-Za-z_$][\w$]*)/)?.[1];
      const localName = alias ?? original;
      if (localName) names.add(localName);
    }
  }
  return names;
}

function hasContractResponsePin(source: string): boolean {
  if (!JSON_RESPONSE_RE.test(source)) return true;
  const importedNames = contractImportedNames(source);
  return [...source.matchAll(RESPONSE_PIN_RE)].some((match) =>
    importedNames.has(match[1]!),
  );
}

describe('route-source classifiers', () => {
  const contractImport =
    "import { requestSchema, type ResponseBody } from '@/features/example/api-contract';";
  const pinnedResponse = 'return Response.json({ ok: true } satisfies ResponseBody);';

  it('reports a seeded contractless route and its missing input classification', () => {
    const source = 'export function GET() { return Response.json({ ok: true }); }';
    expect(CONTRACT_IMPORT_RE.test(source)).toBe(false);
    expect(hasSchemaConsumption(source)).toBe(false);
    expect(findInputMarkers(source)).toEqual([]);
  });

  it('rejects a body route with neither schema consumption nor an input marker', () => {
    const source = `${contractImport}\n${pinnedResponse}`;
    expect(hasSchemaConsumption(source)).toBe(false);
    expect(findInputMarkers(source)).toEqual([]);
  });

  it('rejects a marker on a schema-consuming route', () => {
    const source = `${contractImport}
// input: none
parseJsonBody(request, requestSchema);
${pinnedResponse}`;
    expect(hasSchemaConsumption(source)).toBe(true);
    expect(findInputMarkers(source)).toEqual(['none']);
  });

  it('rejects an invalid input-marker class', () => {
    expect(findInputMarkers('// input: body')).toEqual(['body']);
    expect(VALID_INPUT_CLASSES.has('body')).toBe(false);
  });

  it('rejects a second input marker', () => {
    expect(findInputMarkers('// input: none\n// input: query')).toEqual([
      'none',
      'query',
    ]);
  });

  it('rejects a JSON response not pinned to a contract-imported identifier', () => {
    const source = `${contractImport}
import type { LocalResponse } from './local-types';
return Response.json({ ok: true } satisfies LocalResponse);`;
    expect(hasContractResponsePin(source)).toBe(false);
  });

  it('accepts a schema-consuming route with a contract-pinned response', () => {
    const source = `${contractImport}
parseJsonBody(request, requestSchema);
${pinnedResponse}`;
    expect(hasSchemaConsumption(source)).toBe(true);
    expect(findInputMarkers(source)).toEqual([]);
    expect(hasContractResponsePin(source)).toBe(true);
  });
});

describe('api contract completeness', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s is complete', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts — see CONTRIBUTING.md, Architecture invariants (validation ` +
        `lives in route handlers). Library-owned routes are allowlisted at the top of this test.`,
    ).toBe(true);

    const markers = findInputMarkers(src);
    const consumesSchema = hasSchemaConsumption(src);
    expect(
      markers.length > 0 || consumesSchema,
      `${label(file)} neither consumes a contract schema through parseJsonBody/parseFormBody nor ` +
        `declares an input marker. Schema-less routes must carry exactly one own-line marker: ` +
        `// input: none | query.`,
    ).toBe(true);
    expect(
      markers.length,
      `${label(file)} has more than one "// input:" marker. Keep exactly one classification.`,
    ).toBeLessThan(2);
    if (markers.length === 1) {
      expect(
        VALID_INPUT_CLASSES.has(markers[0]!),
        `${label(file)} has an invalid input class "${markers[0]}". Use exactly one of: none | query.`,
      ).toBe(true);
    }
    expect(
      !(consumesSchema && markers.length > 0),
      `${label(file)} consumes a contract body schema and also carries an input marker. ` +
        `Remove the marker; it would falsely classify a body-consuming route as schema-less.`,
    ).toBe(true);

    expect(
      hasContractResponsePin(src),
      `${label(file)} builds a JSON response without a \`satisfies\` pin to an identifier imported ` +
        `from its api-contract module. Export the response type from that contract and pin the payload.`,
    ).toBe(true);
  });
});
