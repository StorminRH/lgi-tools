import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

/**
 * An EVE dataset endpoint answers at once with the stored copy and says
 * `refreshing` when the view started an ESI refresh behind it. The client
 * reads such an endpoint only through useLiveDataset, the one place that
 * checks back for the newer data and swaps it in; a page that read it on
 * its own would keep the stored copy it was first handed.
 */

const EVE_DATASET_ENDPOINTS = [
  '/api/account/board',
  '/api/account/corp-industry-jobs',
  '/api/account/corp-structures',
  '/api/account/industry-jobs',
  '/api/account/industry-slots',
  '/api/account/structures',
  '/api/industry/owned-assets',
  '/api/industry/owned-blueprints',
  '/api/industry/team-skill-levels',
];

const LIVE_READER = 'src/components/use-live-dataset.ts';

const contracts = import.meta.glob('/src/**/api-contract.ts', { eager: true }) as Record<string, Record<string, unknown>>;

/** The shape of a declared endpoint this census reads: its path and the codec of its 200 answer. */
interface DeclaredEndpoint {
  path: string;
  responses: Record<number, { kind: string; schema?: { shape?: Record<string, unknown> } } | undefined>;
}

function isEndpoint(value: unknown): value is DeclaredEndpoint {
  return typeof value === 'object' && value !== null && 'method' in value && 'path' in value && 'responses' in value;
}

function saysRefreshing(endpoint: DeclaredEndpoint): boolean {
  const codec = endpoint.responses[200];
  if (codec === undefined || codec.kind !== 'json') return false;
  const shape = codec.schema?.shape;
  return shape !== undefined && 'refreshing' in shape;
}

/** Every exported endpoint whose 200 body says `refreshing`, by the name its contract exports it under. */
const liveEndpoints = Object.values(contracts).flatMap((contract) =>
  Object.entries(contract).flatMap(([name, value]) =>
    isEndpoint(value) && saysRefreshing(value) ? [{ name, path: value.path }] : [],
  ),
);

const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__', '_generated'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

const sources = new Map(PRODUCTION_SOURCES.map((file) => [file, stripComments(readFileSync(file, 'utf8'))] as const));

function filesCalling(callee: string, endpointName: string): string[] {
  const call = new RegExp(`\\b${callee}\\(\\s*(?:\\{[^}]*?\\bendpoint:\\s*)?${endpointName}\\b`);
  return [...sources].filter(([, source]) => call.test(source)).map(([file]) => file);
}

describe('client readers of EVE dataset endpoints', () => {
  it('finds every endpoint that says refreshing', () => {
    expect(liveEndpoints.map((endpoint) => endpoint.path).sort()).toEqual(EVE_DATASET_ENDPOINTS);
  });

  it('reads each one through useLiveDataset and never with its own apiFetch', () => {
    const offenders = liveEndpoints
      .filter((endpoint) => filesCalling('apiFetch', endpoint.name).some((file) => file !== LIVE_READER))
      .map((endpoint) => endpoint.path);
    expect(offenders).toEqual([]);
    const unread = liveEndpoints
      .filter((endpoint) => filesCalling('useLiveDataset', endpoint.name).length === 0)
      .map((endpoint) => endpoint.path);
    expect(unread).toEqual([]);
  });

  it('keeps useLiveDataset the only client reader that sends an endpoint to apiFetch by reference', () => {
    const reader = sources.get(LIVE_READER) ?? '';
    expect(reader).toMatch(/\bapiFetch\(read\.endpoint, \{ body: read\.body \}\)/);
    expect(reader).toMatch(/\bapiFetch\(read\)/);
  });
});
