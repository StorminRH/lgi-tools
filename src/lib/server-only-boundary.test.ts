import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts'] as const;

interface ServerRoot {
  path: string;
  kind: 'directory' | 'file';
  lintPatterns: readonly string[];
  exemption?: string;
}

const SERVER_ROOTS: readonly ServerRoot[] = [
  {
    path: 'src/db',
    kind: 'directory',
    lintPatterns: ['@/db', '@/db/*'],
    exemption: 'Shared with the tsx CLI graphs, including the Vercel pre-build entries.',
  },
  {
    path: 'src/scripts',
    kind: 'directory',
    lintPatterns: ['@/scripts/*'],
    exemption: 'The tsx CLI entry band runs outside the Next.js react-server condition.',
  },
  {
    path: 'src/lib/env.ts',
    kind: 'file',
    lintPatterns: ['@/lib/env'],
    exemption: 'Shared by the tsx CLI graphs that validate deployment prerequisites.',
  },
  {
    path: 'src/platform/esi',
    kind: 'directory',
    lintPatterns: ['@/platform/esi', '@/platform/esi/*'],
    exemption: 'Shared with the Convex isolate, where the marker package throws.',
  },
  {
    path: 'src/platform/auth/auth.ts',
    kind: 'file',
    lintPatterns: ['@/platform/auth/auth'],
  },
  {
    path: 'src/platform/auth/eve-sso.ts',
    kind: 'file',
    lintPatterns: ['@/platform/auth/eve-sso'],
  },
  {
    path: 'src/lib/rate-limit.ts',
    kind: 'file',
    lintPatterns: ['@/lib/rate-limit'],
  },
  {
    path: 'src/data/gsc/source.ts',
    kind: 'file',
    lintPatterns: ['@/data/gsc/source'],
  },
  {
    path: 'src/data/eve-data/source.ts',
    kind: 'file',
    lintPatterns: ['@/data/eve-data/source'],
    exemption: 'Shared with the SDE ingestion CLI graph.',
  },
  {
    path: 'src/data/esi-refresh-jobs/pending-signal.ts',
    kind: 'file',
    lintPatterns: ['@/data/esi-refresh-jobs/pending-signal'],
    exemption: 'Shared with the CLI-driven refresh worker graph.',
  },
];

const EXPECTED_MARKERS = [
  'src/data/gsc/source.ts',
  'src/lib/rate-limit.ts',
  'src/platform/auth/auth.ts',
  'src/platform/auth/eve-sso.ts',
] as const;

interface VendorOwnerRule {
  name: string;
  matches: (specifier: string) => boolean;
  owners: readonly string[];
}

const VENDOR_OWNER_RULES: readonly VendorOwnerRule[] = [
  {
    name: 'postgres',
    matches: (specifier) =>
      specifier === 'postgres' || specifier === '@neondatabase/serverless',
    owners: ['src/db/', 'src/scripts/', 'src/composition/pipelines/cron-gate.ts'],
  },
  {
    name: 'upstash',
    matches: (specifier) =>
      specifier === '@upstash/redis' || specifier === '@upstash/ratelimit',
    owners: [
      'src/lib/rate-limit.ts',
      'src/platform/esi/',
      'src/data/esi-refresh-jobs/pending-signal.ts',
    ],
  },
  {
    name: 'google-auth-library',
    matches: (specifier) => specifier === 'google-auth-library',
    owners: ['src/data/gsc/'],
  },
  {
    name: 'yauzl',
    matches: (specifier) => specifier === 'yauzl',
    owners: ['src/data/eve-data/source.ts'],
  },
  {
    name: 'jose',
    matches: (specifier) => specifier === 'jose',
    owners: ['src/platform/auth/'],
  },
  {
    name: 'better-auth server',
    matches: (specifier) =>
      (specifier === 'better-auth' || specifier.startsWith('better-auth/')) &&
      specifier !== 'better-auth/react' &&
      !specifier.startsWith('better-auth/client/'),
    owners: [
      'src/platform/auth/',
      'src/composition/account-lifecycle/',
      'src/app/api/auth/[...all]/route.ts',
      'src/app/industry/active-job-character-ids.ts',
    ],
  },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [absolutePath]
      : [];
  });
}

function relativeSourceMap(): Map<string, string> {
  return new Map(
    sourceFiles(SOURCE_ROOT)
      .filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file))
      .map((file) => [
        path.relative(REPO_ROOT, file).split(path.sep).join('/'),
        readFileSync(file, 'utf8'),
      ]),
  );
}

function isTypeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith('type ')) return true;
  const named = trimmed.match(/^\{([\s\S]*)\}$/);
  const namedSpecifiers = named?.[1];
  if (namedSpecifiers === undefined) return false;
  return namedSpecifiers
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .every((specifier) => specifier.startsWith('type '));
}

function valueImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const fromPattern =
    /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(fromPattern)) {
    const clause = match[1];
    const specifier = match[2];
    if (
      clause !== undefined &&
      specifier !== undefined &&
      !isTypeOnlyClause(clause)
    ) {
      specifiers.push(specifier);
    }
  }
  const sideEffectPattern = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(sideEffectPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

function resolveLocalImport(
  fromPath: string,
  specifier: string,
  files: ReadonlyMap<string, string>,
): string | null {
  let basePath: string;
  if (specifier.startsWith('@/')) {
    basePath = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith('.')) {
    basePath = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  } else {
    return null;
  }

  const candidates = [
    basePath,
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}/index${extension}`),
  ];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function rootForPath(filePath: string, roots: readonly ServerRoot[]): ServerRoot | undefined {
  return roots.find((root) =>
    root.kind === 'file'
      ? filePath === root.path
      : filePath === root.path || filePath.startsWith(`${root.path}/`),
  );
}

function resolvedImports(
  filePath: string,
  files: ReadonlyMap<string, string>,
): string[] {
  const source = files.get(filePath);
  if (source === undefined) return [];
  return valueImportSpecifiers(source).flatMap((specifier) => {
    const target = resolveLocalImport(filePath, specifier, files);
    return target === null ? [] : [target];
  });
}

function rootReachesFrom(
  filePath: string,
  chain: readonly string[],
  files: ReadonlyMap<string, string>,
  roots: readonly ServerRoot[],
  visited: Set<string>,
): string[] {
  if (visited.has(filePath)) return [];
  visited.add(filePath);
  return resolvedImports(filePath, files).flatMap((target) => {
    const nextChain = [...chain, target];
    return rootForPath(target, roots)
      ? [nextChain.join(' -> ')]
      : rootReachesFrom(target, nextChain, files, roots, visited);
  });
}

function clientRootReaches(
  files: ReadonlyMap<string, string>,
  roots: readonly ServerRoot[],
): string[] {
  const clients = [...files.entries()]
    .filter(([, source]) => /^\s*['"]use client['"];?/.test(source))
    .map(([file]) => file);
  const reaches = clients.flatMap((client) =>
    rootReachesFrom(client, [client], files, roots, new Set()),
  );
  return [...new Set(reaches)].sort();
}

function markerFiles(files: ReadonlyMap<string, string>): string[] {
  return [...files.entries()]
    .filter(([, source]) => /^import ['"]server-only['"];/.test(source))
    .map(([file]) => file)
    .sort();
}

function unprotectedRoots(
  roots: readonly ServerRoot[],
  markers: readonly string[],
): string[] {
  return roots
    .filter((root) => !markers.includes(root.path) && !root.exemption?.trim())
    .map((root) => root.path);
}

function ownerMatches(filePath: string, owner: string): boolean {
  return owner.endsWith('/') ? filePath.startsWith(owner) : filePath === owner;
}

function vendorOwnerViolations(files: ReadonlyMap<string, string>): string[] {
  const violations: string[] = [];
  for (const [file, source] of files) {
    for (const specifier of valueImportSpecifiers(source)) {
      for (const rule of VENDOR_OWNER_RULES) {
        if (
          rule.matches(specifier) &&
          !rule.owners.some((owner) => ownerMatches(file, owner))
        ) {
          violations.push(`${rule.name}: ${file} imports ${specifier}`);
        }
      }
    }
  }
  return [...new Set(violations)].sort();
}

describe('server-only boundary', () => {
  const files = relativeSourceMap();

  it('keeps the exact marker set and records every runtime exemption', () => {
    const markers = markerFiles(files);
    expect(markers).toEqual([...EXPECTED_MARKERS]);
    expect(unprotectedRoots(SERVER_ROOTS, markers)).toEqual([]);
  });

  it('keeps every root aligned with the client lint patterns', () => {
    const eslintConfig = readFileSync(path.join(REPO_ROOT, 'eslint.config.mjs'), 'utf8');
    for (const pattern of SERVER_ROOTS.flatMap((root) => root.lintPatterns)) {
      expect(eslintConfig).toContain(`"${pattern}"`);
    }
  });

  it('keeps value imports of privileged vendors inside their declared owners', () => {
    expect(vendorOwnerViolations(files)).toEqual([]);
  });

  it('keeps every use-client graph away from server roots', () => {
    expect(clientRootReaches(files, SERVER_ROOTS)).toEqual([]);
  });

  it('detects an unmarked root in a seeded fixture', () => {
    const fixtureRoot: ServerRoot = {
      path: 'src/lib/new-server-root.ts',
      kind: 'file',
      lintPatterns: ['@/lib/new-server-root'],
    };
    expect(unprotectedRoots([fixtureRoot], [])).toEqual([fixtureRoot.path]);
  });

  it('detects static and dynamic client reaches but ignores type-only imports', () => {
    const fixtureRoot: ServerRoot = {
      path: 'src/lib/server-root.ts',
      kind: 'file',
      lintPatterns: ['@/lib/server-root'],
    };
    const fixture = new Map([
      [
        'src/components/static-client.tsx',
        "'use client';\nimport '@/lib/static-hop';\n",
      ],
      ['src/lib/static-hop.ts', "export * from '@/lib/server-root';\n"],
      [
        'src/components/dynamic-client.tsx',
        "'use client';\nconst load = () => import('@/lib/server-root');\n",
      ],
      [
        'src/components/type-client.tsx',
        "'use client';\nimport type { Secret } from '@/lib/server-root';\n",
      ],
      ['src/lib/server-root.ts', 'export interface Secret { value: string }\n'],
    ]);

    expect(clientRootReaches(fixture, [fixtureRoot])).toEqual([
      'src/components/dynamic-client.tsx -> src/lib/server-root.ts',
      'src/components/static-client.tsx -> src/lib/static-hop.ts -> src/lib/server-root.ts',
    ]);
  });

  it('detects a privileged vendor outside its owner set and ignores type-only use', () => {
    const fixture = new Map([
      ['src/features/example/source.ts', "import postgres from 'postgres';\n"],
      ['src/features/example/types.ts', "import type postgres from 'postgres';\n"],
    ]);
    expect(vendorOwnerViolations(fixture)).toEqual([
      'postgres: src/features/example/source.ts imports postgres',
    ]);
  });
});
