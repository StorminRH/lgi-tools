// Anti-drift, not anti-malice: class methods, re-exports, and subclass-typed
// response returns are deliberate non-goals of this delivery-boundary gate.
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

const CORE_EXPORTS = new Map([
  ['src/platform/auth/route-guards.ts', new Set(['checkSession', 'checkAdmin', 'checkUserId'])],
  ['src/lib/service-auth.ts', new Set(['checkBearerSecret'])],
  ['src/lib/rate-limit.ts', new Set(['checkRateLimit'])],
  ['src/transport/route-body.ts', new Set(['readJsonBody', 'parseFormBody'])],
  ['src/composition/sync/corp-structures-sync.ts', new Set(['stationManagerGate'])],
  ['src/features/custom-structures/system-pin.ts', new Set(['rejectUnknownSystemPin'])],
  ['src/features/wormhole-sites/sites-query.ts', new Set(['parseSitesQuery'])],
]);

const DELIVERY_WRAPPERS = new Set([
  'src/lib/service-auth.ts:requireBearerSecret',
  'src/transport/cron.ts:requireCronAuth',
]);

const PROTECTED_RESPONSE_EXPORTS = new Set([
  ...DELIVERY_WRAPPERS,
  'src/lib/discord.ts:postDiscordWebhook',
  'src/lib/fetch-with-timeout.ts:fetchWithTimeout',
  'src/lib/problem.ts:problemResponse',
  'src/lib/problem.ts:serializeProblem',
  'src/platform/auth/absorb-redirect.ts:decorateAbsorbRedirect',
  'src/transport/api-client.ts:apiFetch',
  'src/transport/api-response.ts:apiResponse',
]);

const REVERSE_SWEEP_ROOTS = [
  'src/platform/auth',
  'src/lib',
  'src/transport',
  'src/composition',
];

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

interface ExportedFunction {
  key: string;
  name: string;
  declaration: FunctionLike;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function exportedFunctions(sourceFile: ts.SourceFile): ExportedFunction[] {
  const file = relative(REPO_ROOT, sourceFile.fileName);
  const functions: ExportedFunction[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      functions.push({
        key: `${file}:${statement.name.text}`,
        name: statement.name.text,
        declaration: statement,
      });
    }
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        functions.push({
          key: `${file}:${declaration.name.text}`,
          name: declaration.name.text,
          declaration: declaration.initializer,
        });
      }
    }
  }
  return functions;
}

function typeContainsResponse(
  type: ts.Type,
  checker: ts.TypeChecker,
  seen = new Set<ts.Type>(),
  depth = 0,
): boolean {
  if (seen.has(type) || depth > 8) return false;
  seen.add(type);
  if (type.symbol?.getName() === 'Response' || type.aliasSymbol?.getName() === 'Response') {
    return true;
  }
  if (type.isUnionOrIntersection()) {
    return type.types.some((member) =>
      typeContainsResponse(member, checker, seen, depth + 1),
    );
  }
  if (isTypeReference(type)) {
    if (
      checker.getTypeArguments(type).some((argument) =>
        typeContainsResponse(argument, checker, seen, depth + 1),
      )
    ) {
      return true;
    }
  }
  return checker.getPropertiesOfType(type).some((property) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration) return false;
    return typeContainsResponse(
      checker.getTypeOfSymbolAtLocation(property, declaration),
      checker,
      seen,
      depth + 1,
    );
  });
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return (type.flags & ts.TypeFlags.Object) !== 0 && 'target' in type;
}

function returnsResponse(
  declaration: FunctionLike,
  checker: ts.TypeChecker,
): boolean {
  const signature = checker.getSignatureFromDeclaration(declaration);
  return signature !== undefined &&
    typeContainsResponse(checker.getReturnTypeOfSignature(signature), checker);
}

function isAnyOrUnknown(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

function returnTypeOf(
  declaration: FunctionLike,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  const signature = checker.getSignatureFromDeclaration(declaration);
  return signature === undefined ? undefined : checker.getReturnTypeOfSignature(signature);
}

function returnsAnyOrUnknown(
  declaration: FunctionLike,
  checker: ts.TypeChecker,
): boolean {
  const returnType = returnTypeOf(declaration, checker);
  return returnType !== undefined && isAnyOrUnknown(returnType);
}

function propertyType(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  const property = checker.getPropertyOfType(type, name);
  const declaration = property?.valueDeclaration ?? property?.declarations?.[0];
  return property && declaration
    ? checker.getTypeOfSymbolAtLocation(property, declaration)
    : undefined;
}

function unwrapPromiseType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  if (
    !isTypeReference(type) ||
    (type.symbol?.getName() !== 'Promise' &&
      type.target.symbol?.getName() !== 'Promise')
  ) {
    return type;
  }
  return checker.getTypeArguments(type)[0] ?? type;
}

type FailureUnionArm = 'success' | 'failure';

function failureUnionArm(
  member: ts.Type,
  checker: ts.TypeChecker,
  appFailureType: ts.Type,
): FailureUnionArm | null {
  if (isAnyOrUnknown(member)) return null;
  const ok = propertyType(member, 'ok', checker);
  if (!ok) return null;
  const discriminant = checker.typeToString(ok);
  if (discriminant === 'true') return 'success';
  if (discriminant !== 'false') return null;
  const failure = propertyType(member, 'failure', checker);
  return failure &&
    !isAnyOrUnknown(failure) &&
    checker.isTypeAssignableTo(failure, appFailureType)
    ? 'failure'
    : null;
}

function returnsFailureUnion(
  declaration: FunctionLike,
  checker: ts.TypeChecker,
  appFailureType: ts.Type,
): boolean {
  const declared = returnTypeOf(declaration, checker);
  if (!declared || isAnyOrUnknown(declared)) return false;
  const result = unwrapPromiseType(declared, checker);
  if (isAnyOrUnknown(result) || !result.isUnion()) return false;
  const arms = result.types.map((member) =>
    failureUnionArm(member, checker, appFailureType),
  );
  return (
    arms.every((arm) => arm !== null) &&
    arms.includes('success') &&
    arms.includes('failure')
  );
}

function createProjectProgram(): ts.Program {
  const configPath = join(REPO_ROOT, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, (file) => readFileSync(file, 'utf8'));
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO_ROOT);
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function sourceFor(program: ts.Program, relativePath: string): ts.SourceFile {
  const source = program.getSourceFile(join(REPO_ROOT, relativePath));
  if (!source) throw new Error(`TypeScript program omitted ${relativePath}`);
  return source;
}

function declaredType(
  sourceFile: ts.SourceFile,
  name: string,
  checker: ts.TypeChecker,
): ts.Type {
  let declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined;
  for (const statement of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
    ) {
      declaration = statement;
      break;
    }
  }
  const symbol = declaration
    ? checker.getSymbolAtLocation(declaration.name)
    : undefined;
  if (!symbol) throw new Error(`TypeScript program omitted type ${name}`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function functionProducesResponse(
  fn: ExportedFunction,
  checker: ts.TypeChecker,
): boolean {
  let producesResponse = false;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      typeContainsResponse(checker.getTypeAtLocation(node), checker)
    ) {
      producesResponse = true;
      return;
    }
    if (!producesResponse) ts.forEachChild(node, visit);
  };
  if (fn.declaration.body) visit(fn.declaration.body);
  return producesResponse;
}

function responseProducingExpressions(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): string[] {
  const violations: string[] = [];
  const exported = exportedFunctions(sourceFile);
  for (const fn of exported) {
    if (DELIVERY_WRAPPERS.has(fn.key)) continue;
    if (functionProducesResponse(fn, checker)) violations.push(fn.key);
  }
  return violations;
}

function fixtureProject(source: string): {
  checker: ts.TypeChecker;
  file: ts.SourceFile;
} {
  const fileName = '/fixture/src/lib/new-guard.ts';
  const options = {
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: true,
    target: ts.ScriptTarget.ES2022,
  } satisfies ts.CompilerOptions;
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile;
  host.fileExists = (candidate) => candidate === fileName || ts.sys.fileExists(candidate);
  host.readFile = (candidate) => candidate === fileName ? source : ts.sys.readFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (candidate === fileName) {
      return ts.createSourceFile(candidate, source, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([fileName], options, host);
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(fileName);
  if (!file) throw new Error('Fixture program omitted its source file');
  return { checker, file };
}

function reverseSweepFunctions(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ExportedFunction[] {
  return exportedFunctions(sourceFile).filter(
    (fn) =>
      returnsResponse(fn.declaration, checker) ||
      (returnsAnyOrUnknown(fn.declaration, checker) &&
        functionProducesResponse(fn, checker)),
  );
}

function fixtureViolations(source: string): string[] {
  const { checker, file } = fixtureProject(source);
  return reverseSweepFunctions(file, checker)
    .map((fn) => fn.name);
}

function fixtureExpressionViolations(source: string): string[] {
  const { checker, file } = fixtureProject(source);
  return responseProducingExpressions(file, checker);
}

function fixtureReturnsFailureUnion(source: string): boolean {
  const { checker, file } = fixtureProject(source);
  const core = exportedFunctions(file)[0];
  if (!core) throw new Error('Fixture program omitted its exported core');
  return returnsFailureUnion(
    core.declaration,
    checker,
    declaredType(file, 'AppFailure', checker),
  );
}

const program = createProjectProgram();
const checker = program.getTypeChecker();
const appFailureType = declaredType(
  sourceFor(program, 'src/lib/failure.ts'),
  'AppFailure',
  checker,
);

describe('guard and parser emission boundaries', () => {
  it('pins the exact delivery-wrapper allowlist', () => {
    expect([...DELIVERY_WRAPPERS].sort()).toEqual([
      'src/lib/service-auth.ts:requireBearerSecret',
      'src/transport/cron.ts:requireCronAuth',
    ]);
  });

  it.each([...CORE_EXPORTS])('%s exports only failure-returning cores', (file, coreNames) => {
    const functions = exportedFunctions(sourceFor(program, file));
    const cores = functions.filter((fn) => coreNames.has(fn.name));
    expect(cores.map((core) => core.name).sort()).toEqual([...coreNames].sort());
    expect(
      cores.filter(
        (core) => !returnsFailureUnion(core.declaration, checker, appFailureType),
      ),
    ).toEqual([]);
  });

  it('finds no response-producing expression outside delivery wrappers in core modules', () => {
    const violations = [...CORE_EXPORTS.keys()].flatMap((file) =>
      responseProducingExpressions(sourceFor(program, file), checker),
    );
    expect(violations).toEqual([]);
  });

  it('reverse-sweeps protected layers for every Response-returning export', () => {
    const responseExports = new Set(
      program
        .getSourceFiles()
        .filter((file) =>
          REVERSE_SWEEP_ROOTS.some((root) =>
            relative(REPO_ROOT, file.fileName).startsWith(`${root}/`),
          ),
        )
        .flatMap(exportedFunctions)
        .filter(
          (fn) =>
            returnsResponse(fn.declaration, checker) ||
            (returnsAnyOrUnknown(fn.declaration, checker) &&
              functionProducesResponse(fn, checker)),
        )
        .map((fn) => fn.key),
    );
    expect([...responseExports].sort()).toEqual([...PROTECTED_RESPONSE_EXPORTS].sort());
  });
});

describe('seeded red fixtures', () => {
  it.each([
    [
      'direct constructor',
      'export function checkDirect(): Response { return new Response(); }',
    ],
    [
      'constructor alias',
      'const HttpResponse = Response; export function checkAlias(): Response { return new HttpResponse(); }',
    ],
    [
      'globalThis constructor',
      'export function checkGlobal(): Response { return new globalThis.Response(); }',
    ],
    [
      'helper-wrapped response',
      'function emit(): Response { return new Response(); } export function checkHelper() { return emit(); }',
    ],
    [
      'problemResponse-returning core',
      'declare function problemResponse(value: unknown): Response; export function checkProblem() { return problemResponse({}); }',
    ],
    [
      'new protected file',
      'export const checkNewFile = (): Promise<Response> => Promise.resolve(new Response());',
    ],
  ])('rejects the %s fixture', (_label, source) => {
    expect(fixtureViolations(source).length).toBeGreaterThan(0);
  });

  it('runs the body scanner against a response-producing core fixture', () => {
    expect(
      fixtureExpressionViolations(
        'export function checkJson() { return Response.json({ ok: false }); }',
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [
      'unknown response core',
      'export function checkUnknown(): unknown { return new Response(); }',
    ],
    ['any core', 'export function checkAny(): any { return { ok: true }; }'],
    ['boolean core', 'export function checkBoolean(): boolean { return true; }'],
  ])('rejects the %s as a failure-union core', (_label, declaration) => {
    const source = `interface AppFailure { category: 'validation'; code: string }
${declaration}`;
    expect(fixtureReturnsFailureUnion(source)).toBe(false);
  });

  it('reverse-sweeps an unknown-typed export whose body creates a response', () => {
    const source =
      'export function checkUnknown(): unknown { return new Response(); }';
    expect(fixtureViolations(source)).toContain('checkUnknown');
    expect(fixtureExpressionViolations(source).length).toBeGreaterThan(0);
  });
});
