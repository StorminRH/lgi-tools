/**
 * Which top-level symbols can clear a cache tag, followed through imports,
 * re-exports and the bodies that reference them, so a census can keep
 * every one of them out of page renders: revalidateTag throws during a
 * render, and an after() scheduled from one is no safer.
 *
 * A symbol is `file#name`; a package export is `specifier#name`. A body
 * that references a clearing symbol anywhere, called or passed on, clears
 * too. Server Functions ('use server') may clear tags, so they never count.
 */
import ts from 'typescript';
import { resolveLocalImport } from '@/lib/__tests__/source-scan';

type Directive = 'use client' | 'use server' | null;

interface Binding {
  readonly from: string;
  readonly name: string;
}

interface ModuleFacts {
  readonly directive: Directive;
  /** Local name to the module and export it was imported from. */
  readonly imports: Map<string, Binding>;
  /** Exported name to a local name, or to another module's export. */
  readonly exports: Map<string, string | Binding>;
  readonly starExports: string[];
  /** Top-level declaration to every identifier its body references. */
  readonly declarations: Map<string, Set<string>>;
  /** Every identifier the file references. */
  readonly references: Set<string>;
}

export type SourceModules = ReadonlyMap<string, string>;

const TAG_CLEARS = ['next/cache#revalidateTag', 'next/cache#updateTag'];

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

/** Whether `node` names a member rather than referring to a binding: `a.name`, `{ name: v }`. */
function isMemberName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node);
}

function collectReferences(node: ts.Node | undefined, into: Set<string>): Set<string> {
  if (node === undefined || ts.isTypeNode(node)) return into;
  if (ts.isIdentifier(node) && !isMemberName(node)) into.add(node.text);
  ts.forEachChild(node, (child) => void collectReferences(child, into));
  return into;
}

function directiveOf(source: ts.SourceFile): Directive {
  const first = source.statements[0];
  if (first === undefined || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) return null;
  const text = first.expression.text;
  return text === 'use client' || text === 'use server' ? text : null;
}

function noteImport(facts: ModuleFacts, node: ts.ImportDeclaration, from: string): void {
  const clause = node.importClause;
  if (clause === undefined || clause.isTypeOnly) return;
  if (clause.name !== undefined) facts.imports.set(clause.name.text, { from, name: 'default' });
  const bindings = clause.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) return;
  for (const element of bindings.elements) {
    if (!element.isTypeOnly) facts.imports.set(element.name.text, { from, name: (element.propertyName ?? element.name).text });
  }
}

function noteExport(facts: ModuleFacts, node: ts.ExportDeclaration, from: string | null): void {
  if (node.isTypeOnly) return;
  const clause = node.exportClause;
  if (clause === undefined) {
    if (from !== null) facts.starExports.push(from);
    return;
  }
  if (!ts.isNamedExports(clause)) return;
  for (const element of clause.elements) {
    const local = (element.propertyName ?? element.name).text;
    facts.exports.set(element.name.text, from === null ? local : { from, name: local });
  }
}

function noteDeclaration(facts: ModuleFacts, name: string, body: ts.Node | undefined, exported: string | null): void {
  facts.declarations.set(name, collectReferences(body, new Set()));
  if (exported !== null) facts.exports.set(exported, name);
}

function exportedName(node: ts.Node, name: string): string | null {
  if (!hasModifier(node, ts.SyntaxKind.ExportKeyword)) return null;
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : name;
}

function noteVariables(facts: ModuleFacts, statement: ts.VariableStatement): void {
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) {
      noteDeclaration(facts, declaration.name.text, declaration.initializer, exportedName(statement, declaration.name.text));
    }
  }
}

function noteStatement(facts: ModuleFacts, statement: ts.Statement, resolve: (specifier: string) => string): void {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    noteImport(facts, statement, resolve(statement.moduleSpecifier.text));
  } else if (ts.isExportDeclaration(statement)) {
    const specifier = statement.moduleSpecifier;
    noteExport(facts, statement, specifier !== undefined && ts.isStringLiteral(specifier) ? resolve(specifier.text) : null);
  } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined) {
    noteDeclaration(facts, statement.name.text, statement, exportedName(statement, statement.name.text));
  } else if (ts.isVariableStatement(statement)) {
    noteVariables(facts, statement);
  }
}

function moduleFacts(file: string, text: string, modules: SourceModules): ModuleFacts {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const facts: ModuleFacts = {
    directive: directiveOf(source),
    imports: new Map(),
    exports: new Map(),
    starExports: [],
    declarations: new Map(),
    references: collectReferences(source, new Set()),
  };
  const resolve = (specifier: string): string => resolveLocalImport(file, specifier, (candidate) => modules.has(candidate)) ?? specifier;
  for (const statement of source.statements) noteStatement(facts, statement, resolve);
  return facts;
}

/** The symbol a module's export resolves to, through re-exports; a package export stands for itself. */
function resolveExport(facts: ReadonlyMap<string, ModuleFacts>, file: string, name: string, seen = new Set<string>()): string | null {
  const own = facts.get(file);
  if (own === undefined) return `${file}#${name}`;
  if (seen.has(`${file}#${name}`)) return null;
  seen.add(`${file}#${name}`);
  const target = own.exports.get(name);
  if (typeof target === 'string') return resolveName(facts, file, target, seen);
  if (target !== undefined) return resolveExport(facts, target.from, target.name, seen);
  // A package behind `export *` is never searched: what it exports is unknown here.
  const found = own.starExports.filter((star) => facts.has(star)).map((star) => resolveExport(facts, star, name, seen));
  return found.find((symbol) => symbol !== null) ?? null;
}

/** The symbol a name refers to inside `file`: its own declaration, or what it imported. */
function resolveName(facts: ReadonlyMap<string, ModuleFacts>, file: string, name: string, seen = new Set<string>()): string | null {
  const own = facts.get(file);
  if (own === undefined) return null;
  if (own.declarations.has(name)) return `${file}#${name}`;
  const imported = own.imports.get(name);
  return imported === undefined ? null : resolveExport(facts, imported.from, imported.name, seen);
}

/** The first clearing symbol `names` refer to inside `file`, or null. */
function clearingReference(
  facts: ReadonlyMap<string, ModuleFacts>,
  file: string,
  names: Iterable<string>,
  clearing: ReadonlyMap<string, string | null>,
): string | null {
  for (const name of names) {
    const symbol = resolveName(facts, file, name);
    if (symbol !== null && clearing.has(symbol)) return symbol;
  }
  return null;
}

/**
 * One pass: every declaration outside a Server Function module and the
 * boundaries that references a clearing symbol, noting which; true when
 * any was new.
 */
function spreadOnce(
  facts: ReadonlyMap<string, ModuleFacts>,
  clearing: Map<string, string | null>,
  boundaries: ReadonlySet<string>,
): boolean {
  let grew = false;
  for (const [file, own] of facts) {
    if (own.directive === 'use server') continue;
    for (const [name, references] of own.declarations) {
      const symbol = `${file}#${name}`;
      const via = clearing.has(symbol) || boundaries.has(symbol) ? null : clearingReference(facts, file, references, clearing);
      if (via !== null) {
        clearing.set(symbol, via);
        grew = true;
      }
    }
  }
  return grew;
}

/** The path from a clearing symbol down to revalidateTag or updateTag. */
function chainOf(clearing: ReadonlyMap<string, string | null>, symbol: string): string[] {
  const chain = [symbol];
  for (let via = clearing.get(symbol); via != null && !chain.includes(via); via = clearing.get(via)) chain.push(via);
  return chain;
}

export interface RenderReach {
  /** Every symbol that can clear a cache tag, revalidateTag and updateTag included. */
  readonly clearing: ReadonlySet<string>;
  /**
   * For each render file, every clearing symbol it imports, with the path
   * that symbol takes to the tag clear: `file: a > b > next/cache#revalidateTag`.
   */
  offenders(renderFiles: readonly string[]): string[];
  /** The boundaries that do hold clearing code, so none is left standing for code that is gone. */
  readonly heldBoundaries: ReadonlySet<string>;
  /** The file's top directive, 'use client' or 'use server', or null. */
  directive(file: string): string | null;
}

function holdsClearing(facts: ReadonlyMap<string, ModuleFacts>, symbol: string, clearing: ReadonlyMap<string, string | null>): boolean {
  const [file = '', name = ''] = symbol.split('#');
  const references = facts.get(file)?.declarations.get(name);
  return references !== undefined && clearingReference(facts, file, references, clearing) !== null;
}

/**
 * `boundaries` are symbols that hold clearing code without running it where
 * they are referenced: a dependency container whose callbacks another entry
 * point runs. They never count as clearing.
 */
export function renderReach(modules: SourceModules, boundaries: ReadonlySet<string> = new Set()): RenderReach {
  const facts = new Map([...modules].map(([file, text]) => [file, moduleFacts(file, text, modules)] as const));
  const clearing = new Map<string, string | null>(TAG_CLEARS.map((sink) => [sink, null]));
  while (spreadOnce(facts, clearing, boundaries));
  // A render file's own declarations only repeat what they import, so only imports are named.
  const offendersIn = (file: string): string[] =>
    [...(facts.get(file)?.references ?? [])]
      .map((name) => resolveName(facts, file, name))
      .filter((symbol): symbol is string => symbol !== null && clearing.has(symbol) && !symbol.startsWith(`${file}#`))
      .map((symbol) => `${file}: ${chainOf(clearing, symbol).join(' > ')}`);
  return {
    clearing: new Set(clearing.keys()),
    offenders: (renderFiles) => [...new Set(renderFiles.flatMap(offendersIn))].sort(),
    heldBoundaries: new Set([...boundaries].filter((symbol) => holdsClearing(facts, symbol, clearing))),
    directive: (file) => facts.get(file)?.directive ?? null,
  };
}
