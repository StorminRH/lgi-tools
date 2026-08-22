import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { normalizeModulePath } from '@/lib/__tests__/module-path';

/** Feature widgets mapper and the widget preview are allowed to host. */
export const HOSTED_WIDGETS = [
  'src/features/wormhole-sites/widget.tsx',
] as const;

const WIDGET_HOST_ROOTS = [
  'src/mapper',
  'src/app/(site)/preview/widgets',
] as const;

/** Host files that currently import a listed widget. The scan must keep finding them. */
export const WIDGET_HOST_FILES = [
  'src/app/(site)/preview/widgets/page.tsx',
  'src/mapper/signatures/ActiveSiteViewer.tsx',
  'src/mapper/signatures/SignatureWindow.tsx',
] as const;

const SKIPPED_DIRECTORIES = new Set([
  'test-support',
  '__tests__',
  '__mocks__',
  'node_modules',
  '__fixtures__',
]);

const WIDGET_PATH = /^src\/features\/[^/]+\/widget\.tsx$/;
const FEATURE_TSX = /^src\/features\/.+\.tsx$/;
const EXTENSION = /\.(?:tsx|ts|jsx|js)$/;

const IMPORT_PATTERN = /import\s+([^;'"]*?)\s+from\s*['"]([^'"]+)['"]/g;
const EXPORT_FROM_PATTERN = /export\s+[^;'"]*?\s+from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export type ModuleResolver = (fromFile: string, specifier: string) => string | null;

export type HostedFeatureUi =
  | { kind: 'widget'; host: string; widget: string }
  | { kind: 'illegal'; host: string; module: string };

function isProductionSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) return false;
  return !fileName.includes('.test.');
}

export function collectHostSources(rootDir: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (isProductionSource(entry.name)) {
        found.push(path.replaceAll('\\', '/'));
      }
    }
  };
  walk(rootDir);
  return found.sort();
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function specifierBase(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) {
    return normalizeModulePath(`src/${specifier.slice(2)}`);
  }
  if (!specifier.startsWith('.')) return null;
  const slash = fromFile.lastIndexOf('/');
  const directory = slash === -1 ? '' : fromFile.slice(0, slash);
  return normalizeModulePath(`${directory}/${specifier}`);
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolveHostSpecifier(fromFile: string, specifier: string): string | null {
  const base = specifierBase(fromFile, specifier);
  if (base === null) return null;
  const candidates = EXTENSION.test(base)
    ? [base]
    : [`${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find(isFile) ?? null;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const clause = match[1]?.trim();
    const specifier = match[2];
    if (clause === undefined || specifier === undefined || clause.startsWith('type ')) continue;
    specifiers.push(specifier);
  }
  for (const match of source.matchAll(EXPORT_FROM_PATTERN)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT_PATTERN)) {
    const specifier = match[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

export function classifyFeatureUiImports(options: {
  host: string;
  source: string;
  resolve: ModuleResolver;
}): HostedFeatureUi[] {
  const hits: HostedFeatureUi[] = [];
  for (const specifier of importSpecifiers(withoutComments(options.source))) {
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
