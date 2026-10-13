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
const FEATURE_TS = /^src\/features\/.+\.ts$/;
// An `export ... from` statement, read the way source-scan reads a clause:
// it stops at a `;`, a quote, or a line that opens another import or export.
const RE_EXPORT =
  /(?:^|\n|;)\s*export\s+(?:(?!\n\s*(?:import|export)\b)[^;'"])*?\s+from\s+['"][^'"]+['"]/g;

export type ModuleResolver = (fromFile: string, specifier: string) => string | null;
export type ModuleReader = (modulePath: string) => string;

const NO_SOURCE: ModuleReader = () => '';

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

/** Whether a feature .ts module re-exports a feature component at runtime. */
function reExportsFeatureUi(
  modulePath: string,
  resolve: ModuleResolver,
  readModule: ModuleReader,
): boolean {
  const statements = [...stripComments(readModule(modulePath)).matchAll(RE_EXPORT)]
    .map(([statement]) => statement)
    .join('\n');
  return valueImportSpecifiers(statements).some((specifier) => {
    const target = resolve(modulePath, specifier);
    return target !== null && FEATURE_TSX.test(target);
  });
}

/**
 * Classifies a host's runtime imports of feature UI. A feature .ts module
 * that re-exports a feature component counts as that component, so a .ts
 * barrel cannot carry feature UI past the slice widget.
 */
export function classifyFeatureUiImports(options: {
  host: string;
  source: string;
  resolve: ModuleResolver;
  /** Reads a feature .ts module the host imports. Without it, .ts barrels go unread. */
  readModule?: ModuleReader;
}): HostedFeatureUi[] {
  const readModule = options.readModule ?? NO_SOURCE;
  const hits: HostedFeatureUi[] = [];
  for (const specifier of valueImportSpecifiers(stripComments(options.source))) {
    const modulePath = options.resolve(options.host, specifier);
    if (modulePath === null) continue;
    if (FEATURE_TSX.test(modulePath)) {
      hits.push(
        WIDGET_PATH.test(modulePath)
          ? { kind: 'widget', host: options.host, widget: modulePath }
          : { kind: 'illegal', host: options.host, module: modulePath },
      );
    } else if (FEATURE_TS.test(modulePath) && reExportsFeatureUi(modulePath, options.resolve, readModule)) {
      hits.push({ kind: 'illegal', host: options.host, module: modulePath });
    }
  }
  return hits;
}

function readRepoFile(modulePath: string): string {
  return readFileSync(modulePath, 'utf8');
}

export function scanWidgetHosts(resolve: ModuleResolver = resolveHostSpecifier): HostedFeatureUi[] {
  return WIDGET_HOST_ROOTS.flatMap((root) =>
    collectHostSources(root).flatMap((host) =>
      classifyFeatureUiImports({
        host,
        source: readRepoFile(host),
        resolve,
        readModule: readRepoFile,
      }),
    ),
  );
}
