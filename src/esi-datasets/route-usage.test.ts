import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';

/**
 * Declare once: every ESI route the code reads is a registry declaration,
 * and every declaration is read somewhere. The store types its keys as
 * `EsiRoute`, so an undeclared route already fails typecheck; this census
 * catches the rest: a route spelled outside a key (the map tracker's path
 * builders) and a declaration nothing reads any more.
 */

const REGISTRY = 'src/lib/esi-datasets/entries.ts';
const PATH_BUILDERS = 'src/platform/esi/paths.ts';

/** A quoted literal shaped like an ESI route template: slash-wrapped lower-case segments and `{placeholders}`. */
const ROUTE_LITERAL = /['"](\/(?:[a-z0-9_{}]+\/)+)['"]/g;
/** A template literal of the same shape whose segments interpolate a builder argument. */
const ROUTE_TEMPLATE = /`(\/(?:[^`/]+\/)+)`/g;

const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__', '_generated'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

const sources = new Map(PRODUCTION_SOURCES.map((file) => [file, stripComments(readFileSync(file, 'utf8'))] as const));

const declared = new Set<string>(ESI_DATASET_ENTRIES.flatMap((entry) => entry.routes.map((route) => route.route)));

/** The first path segment of every declared route: a literal under one of these is an ESI route and must be declared. */
const esiRoots = new Set([...declared].map((route) => route.split('/')[1]!));

function routeLiterals(source: string): string[] {
  return [...source.matchAll(ROUTE_LITERAL)].map((match) => match[1]!);
}

/** `${characterId}` becomes `{character_id}`, the registry's spelling of the same placeholder. */
function placeholderOf(name: string): string {
  return `{${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}}`;
}

function templateRoutes(source: string): string[] {
  return [...source.matchAll(ROUTE_TEMPLATE)].map((match) =>
    match[1]!.replace(/\$\{(\w+)\}/g, (_, name: string) => placeholderOf(name)),
  );
}

function undeclaredRoutes(literals: readonly string[], known: ReadonlySet<string>, roots: ReadonlySet<string>): string[] {
  return literals.filter((route) => roots.has(route.split('/')[1]!) && !known.has(route));
}

const readers = [...sources].filter(([file]) => file !== REGISTRY);
const literalSites = readers.flatMap(([file, source]) => routeLiterals(source).map((route) => ({ file, route })));
const builderTemplates = templateRoutes(sources.get(PATH_BUILDERS) ?? '');

describe('ESI route usage', () => {
  it('finds the route spellings', () => {
    expect(literalSites.length).toBeGreaterThan(30);
    expect(builderTemplates).toEqual([
      '/characters/{character_id}/location/',
      '/characters/{character_id}/ship/',
      '/characters/{character_id}/online/',
    ]);
  });

  it('declares every ESI route the code spells', () => {
    const offenders = literalSites
      .filter(({ route }) => undeclaredRoutes([route], declared, esiRoots).length > 0)
      .map(({ file, route }) => `${file}: ${route}`);
    expect(offenders).toEqual([]);
    expect(builderTemplates.filter((route) => !declared.has(route))).toEqual([]);
  });

  it('reads every declaration somewhere', () => {
    const read = new Set([...literalSites.map(({ route }) => route), ...builderTemplates]);
    expect([...declared].filter((route) => !read.has(route))).toEqual([]);
  });

  it('spots a seeded undeclared route and leaves non-ESI paths alone', () => {
    const seeded = "const key = { route: '/characters/{character_id}/mail/' }; const page = '/api/'; const ok = '/status/';";
    expect(routeLiterals(seeded)).toEqual(['/characters/{character_id}/mail/', '/api/', '/status/']);
    expect(undeclaredRoutes(routeLiterals(seeded), declared, esiRoots)).toEqual(['/characters/{character_id}/mail/']);
    expect(templateRoutes('return `/characters/${characterId}/mail/`;')).toEqual(['/characters/{character_id}/mail/']);
  });
});
