import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listSourceFiles,
  MODULE_EXTENSIONS,
  resolveLocalImport,
  valueImportSpecifiers,
} from '@/lib/__tests__/source-scan';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

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
    path: 'src/composition/auth.ts',
    kind: 'file',
    lintPatterns: ['@/composition/auth'],
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
    path: 'src/features/feedback/create-linear-issue.ts',
    kind: 'file',
    lintPatterns: ['@/features/feedback/create-linear-issue'],
  },
  {
    path: 'src/data/wh-statics/source.ts',
    kind: 'file',
    lintPatterns: ['@/data/wh-statics/source'],
  },
  {
    path: 'src/data/eve-data/source.ts',
    kind: 'file',
    lintPatterns: ['@/data/eve-data/source'],
    exemption: 'Shared with the SDE ingestion CLI graph.',
  },
];

const EXPECTED_MARKERS = [
  'src/composition/auth.ts',
  'src/composition/synthetic-pilot-store.ts',
  'src/data/gsc/source.ts',
  'src/data/wh-statics/source.ts',
  'src/features/feedback/create-linear-issue.ts',
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
    owners: ['src/db/', 'src/scripts/'],
  },
  {
    name: 'upstash',
    matches: (specifier) =>
      specifier === '@upstash/redis' || specifier === '@upstash/ratelimit',
    owners: ['src/lib/upstash.ts', 'src/lib/rate-limit.ts'],
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
      'src/app/(site)/industry/industry-characters.ts',
    ],
  },
];

function relativeSourceMap(): Map<string, string> {
  const files = listSourceFiles({
    roots: ['src'],
    extensions: MODULE_EXTENSIONS,
    skipSuffixes: ['.test.ts', '.test.tsx', '.test.mts', '.spec.ts', '.spec.tsx', '.spec.mts'],
  });
  return new Map(files.map((file) => [file, readFileSync(path.join(REPO_ROOT, file), 'utf8')]));
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
    const target = resolveLocalImport(filePath, specifier, (candidate) => files.has(candidate));
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
