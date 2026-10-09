import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeModulePath } from './module-path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts'] as const;
const ROUTE_FILE = /^route\.(?:ts|js|mts|mjs)$/;

// The clause stops at a `;`, a quote, or a line that opens another import or
// export, so a match that starts at a statement without `from` fails there
// instead of splicing that statement into the next one's clause.
const FROM_CLAUSE =
  /(?:^|\n)\s*(?:import|export)\s+((?:(?!\n\s*(?:import|export)\b)[^;'"])*?)\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function filesUnder(
  directory: string,
  accepts: (fileName: string) => boolean,
  skipDirectories: readonly string[],
): string[] {
  const entries = readdirSync(path.resolve(REPO_ROOT, directory), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return skipDirectories.includes(entry.name)
        ? []
        : filesUnder(file, accepts, skipDirectories);
    }
    return accepts(entry.name) ? [file] : [];
  });
}

/**
 * Lists the files under each root whose name ends with one of `extensions`
 * and none of `skipSuffixes`, sorted. Paths keep the root as given, so a
 * repo-relative root yields repo-relative POSIX paths. A directory named in
 * `skipDirectories` is never read.
 */
export function listSourceFiles(options: {
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly skipDirectories?: readonly string[];
  readonly skipSuffixes?: readonly string[];
}): string[] {
  const { extensions, skipSuffixes = [] } = options;
  const accepts = (fileName: string): boolean =>
    extensions.some((extension) => fileName.endsWith(extension)) &&
    !skipSuffixes.some((suffix) => fileName.endsWith(suffix));
  return options.roots
    .flatMap((root) => filesUnder(root, accepts, options.skipDirectories ?? []))
    .sort();
}

/** Every Next.js route handler file under the API tree, sorted. */
export function listRouteFiles(apiRoot = 'src/app/api'): string[] {
  return filesUnder(apiRoot, (fileName) => ROUTE_FILE.test(fileName), []).sort();
}

/** Drops block comments and whole-line `//` comments; trailing `//` text stays. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readSource(file: string): string {
  return readFileSync(path.resolve(REPO_ROOT, file), 'utf8');
}

/** The files whose source matches `pattern` from its start, whatever its flags. */
export function filesMatching(
  files: readonly string[],
  pattern: RegExp,
  read: (file: string) => string = readSource,
): string[] {
  return files.filter((file) => read(file).search(pattern) !== -1);
}

function isTypeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim();
  if (trimmed.startsWith('type ')) return true;
  const namedSpecifiers = /^\{([\s\S]*)\}$/.exec(trimmed)?.[1];
  if (namedSpecifiers === undefined) return false;
  return namedSpecifiers
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .every((specifier) => specifier.startsWith('type '));
}

/**
 * The module specifiers a source loads at runtime: static imports and
 * re-exports whose clause is not type-only, side-effect imports, and
 * dynamic imports.
 */
export function valueImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const [, clause, specifier] of source.matchAll(FROM_CLAUSE)) {
    if (clause !== undefined && specifier !== undefined && !isTypeOnlyClause(clause)) {
      specifiers.push(specifier);
    }
  }
  for (const pattern of [SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function importBase(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return normalizeModulePath(`src/${specifier.slice(2)}`);
  if (!specifier.startsWith('.')) return null;
  return normalizeModulePath(`${path.posix.dirname(fromFile)}/${specifier}`);
}

/**
 * Resolves an `@/` or relative specifier from a repo-relative file to the
 * first existing candidate: the path itself, then each source extension,
 * then an index module. Package specifiers resolve to null.
 */
export function resolveLocalImport(
  fromFile: string,
  specifier: string,
  exists: (file: string) => boolean,
): string | null {
  const base = importBase(fromFile, specifier);
  if (base === null) return null;
  const candidates = [
    base,
    ...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...MODULE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find(exists) ?? null;
}
