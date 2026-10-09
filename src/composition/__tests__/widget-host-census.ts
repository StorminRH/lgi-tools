import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  listSourceFiles,
  resolveLocalImport,
  stripComments,
  valueImportSpecifiers,
} from '@/lib/__tests__/source-scan';

const WIDGET_HOST_ROOTS = [
  'src/mapper',
  'src/app/(site)/preview/widgets',
] as const;

const SKIPPED_DIRECTORIES = [
  'test-support',
  '__tests__',
  '__mocks__',
  'node_modules',
  '__fixtures__',
];

const WIDGET_PATH = /^src\/features\/[^/]+\/widget\.tsx$/;
const FEATURE_TSX = /^src\/features\/.+\.tsx$/;

export type ModuleResolver = (fromFile: string, specifier: string) => string | null;

export type HostedFeatureUi =
  | { kind: 'widget'; host: string; widget: string }
  | { kind: 'illegal'; host: string; module: string };

export function collectHostSources(rootDir: string): string[] {
  return listSourceFiles({
    roots: [rootDir],
    extensions: ['.ts', '.tsx'],
    skipDirectories: SKIPPED_DIRECTORIES,
    skipSuffixes: ['.test.ts', '.test.tsx'],
  });
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolveHostSpecifier(fromFile: string, specifier: string): string | null {
  return resolveLocalImport(fromFile, specifier, isFile);
}

export function classifyFeatureUiImports(options: {
  host: string;
  source: string;
  resolve: ModuleResolver;
}): HostedFeatureUi[] {
  const hits: HostedFeatureUi[] = [];
  for (const specifier of valueImportSpecifiers(stripComments(options.source))) {
    const modulePath = options.resolve(options.host, specifier);
    if (modulePath === null || !FEATURE_TSX.test(modulePath)) continue;
    hits.push(
      WIDGET_PATH.test(modulePath)
        ? { kind: 'widget', host: options.host, widget: modulePath }
        : { kind: 'illegal', host: options.host, module: modulePath },
    );
  }
  return hits;
}

export function scanWidgetHosts(resolve: ModuleResolver = resolveHostSpecifier): HostedFeatureUi[] {
  return WIDGET_HOST_ROOTS.flatMap((root) =>
    collectHostSources(root).flatMap((host) =>
      classifyFeatureUiImports({
        host,
        source: readFileSync(host, 'utf8'),
        resolve,
      }),
    ),
  );
}
