import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(API_DIR, '..', '..');
const REPO_ROOT = join(SRC_DIR, '..');
const ROUTE_BODY_MODULE = '@/transport/route-body';
const API_RESPONSE_MODULE = '@/transport/api-response';
const SCHEMA_HELPERS = new Set(['parseFormBody', 'readJsonBody']);
const INPUT_MARKER_RE = /^[ \t]*\/\/[ \t]*input:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_INPUT_CLASSES = new Set(['none', 'query', 'path']);

const CRON_ROUTES = new Set([
  'cron/drain-esi-refresh-jobs/route.ts',
  'cron/refresh-affiliations/route.ts',
  'cron/refresh-gsc/route.ts',
  'cron/refresh-industry-indices/route.ts',
  'cron/refresh-prices/route.ts',
  'cron/purge-maps/route.ts',
  'cron/refresh-sde/route.ts',
  'cron/refresh-wh-statics/route.ts',
  'cron/sync-sweeper/route.ts',
]);

const FORM_ROUTES = new Set([
  'account/active-character/route.ts',
  'account/characters/unlink/route.ts',
  'admin/characters/reassign/route.ts',
  'admin/characters/unlink/route.ts',
  'admin/esi-jobs/retry/route.ts',
  'admin/role/route.ts',
  'admin/sessions/revoke/route.ts',
  'admin/wh-statics/route.ts',
]);

const LIBRARY_OWNED = new Set(['auth/[...all]/route.ts']);

function findFiles(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, accept));
    else if (accept(entry.name)) out.push(full);
  }
  return out;
}

const ALL_ROUTE_FILES = findFiles(API_DIR, (name) => /^route\.(ts|js|mts|mjs)$/.test(name));
const FIRST_PARTY_ROUTE_FILES = ALL_ROUTE_FILES.filter(
  (file) => !LIBRARY_OWNED.has(relative(API_DIR, file)),
);
const V2_ROUTE_FILES = FIRST_PARTY_ROUTE_FILES.filter((file) => {
  const route = relative(API_DIR, file);
  return !CRON_ROUTES.has(route) && !FORM_ROUTES.has(route);
});

function sourceFile(source: string): ts.SourceFile {
  return ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function namedImports(
  file: ts.SourceFile,
  moduleMatches: (moduleName: string) => boolean,
): Map<string, string> {
  const imports = new Map<string, string>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !moduleMatches(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      imports.set(specifier.name.text, specifier.propertyName?.text ?? specifier.name.text);
    }
  }
  return imports;
}

function hasContractImport(source: string): boolean {
  return namedImports(sourceFile(source), (moduleName) => moduleName.endsWith('api-contract')).size > 0;
}

const SCHEMA_SHELLS = new Map([
  ['runMapLifecycleRoute', '@/app/api/maps/lifecycle-route'],
  ['marketRefreshRoute', '@/app/api/market-refresh-route'],
]);

function hasSchemaConsumption(source: string): boolean {
  const file = sourceFile(source);
  const imports = namedImports(file, (moduleName) => moduleName === ROUTE_BODY_MODULE);
  const helperNames = new Set(
    [...imports].filter(([, imported]) => SCHEMA_HELPERS.has(imported)).map(([local]) => local),
  );
  const shellNames = new Set(
    [...namedImports(file, (moduleName) => [...SCHEMA_SHELLS.values()].includes(moduleName))]
      .filter(([, imported]) => SCHEMA_SHELLS.has(imported))
      .map(([local]) => local),
  );
  let consumed = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (helperNames.has(node.expression.text) || shellNames.has(node.expression.text))
    ) {
      consumed = true;
      return;
    }
    if (!consumed) ts.forEachChild(node, visit);
  };
  visit(file);
  return consumed;
}

function inputMarkers(source: string): string[] {
  return [...source.matchAll(INPUT_MARKER_RE)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

interface V2Classification {
  endpointImports: Set<string>;
  apiResponseCalls: number;
  mixedRawResponse: boolean;
  retainsResponsePin: boolean;
}

function isRawResponseNode(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text === 'NextResponse') return true;
  return (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Response'
  );
}

function isResponseJsonCall(node: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Response' &&
    node.expression.name.text === 'json'
  );
}

function calledIdentifier(node: ts.CallExpression): string | null {
  return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function firstArgIdentifier(node: ts.CallExpression): string | null {
  const argument = node.arguments[0];
  return argument && ts.isIdentifier(argument) ? argument.text : null;
}

function secondArgIdentifier(node: ts.CallExpression): string | null {
  const argument = node.arguments[1];
  return argument && ts.isIdentifier(argument) ? argument.text : null;
}

function lifecycleEndpointName(node: ts.CallExpression): string | null {
  const options = node.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return null;
  for (const property of options.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'endpoint' &&
      ts.isIdentifier(property.initializer)
    ) {
      return property.initializer.text;
    }
  }
  return null;
}

function boundEndpointCalls(
  node: ts.CallExpression,
  apiResponseNames: ReadonlySet<string>,
  endpointImports: ReadonlySet<string>,
  lifecycleNames: ReadonlySet<string>,
  marketNames: ReadonlySet<string>,
): number {
  const callee = calledIdentifier(node);
  if (callee !== null && apiResponseNames.has(callee)) {
    const endpoint = firstArgIdentifier(node);
    return endpoint !== null && endpointImports.has(endpoint) ? 1 : 0;
  }
  if (callee !== null && lifecycleNames.has(callee)) {
    const endpoint = lifecycleEndpointName(node);
    return endpoint !== null && endpointImports.has(endpoint) ? 1 : 0;
  }
  if (callee !== null && marketNames.has(callee)) {
    const endpoint = secondArgIdentifier(node);
    return endpoint !== null && endpointImports.has(endpoint) ? 1 : 0;
  }
  return 0;
}

function classifyV2Route(source: string): V2Classification {
  const file = sourceFile(source);
  const contractImports = namedImports(file, (moduleName) => moduleName.endsWith('api-contract'));
  const endpointImports = new Set(
    [...contractImports]
      .filter(([, imported]) => imported.endsWith('Endpoint'))
      .map(([local]) => local),
  );
  const responseImports = namedImports(file, (moduleName) => moduleName === API_RESPONSE_MODULE);
  const apiResponseNames = new Set(
    [...responseImports]
      .filter(([, imported]) => imported === 'apiResponse')
      .map(([local]) => local),
  );
  const lifecycleNames = new Set(
    [...namedImports(file, (moduleName) => moduleName === '@/app/api/maps/lifecycle-route')]
      .filter(([, imported]) => imported === 'runMapLifecycleRoute')
      .map(([local]) => local),
  );
  const marketNames = new Set(
    [...namedImports(file, (moduleName) => moduleName === '@/app/api/market-refresh-route')]
      .filter(([, imported]) => imported === 'marketRefreshRoute')
      .map(([local]) => local),
  );
  let apiResponseCalls = 0;
  let mixedRawResponse = false;

  const visit = (node: ts.Node): void => {
    if (isRawResponseNode(node)) mixedRawResponse = true;
    if (ts.isCallExpression(node)) {
      apiResponseCalls += boundEndpointCalls(
        node,
        apiResponseNames,
        endpointImports,
        lifecycleNames,
        marketNames,
      );
      if (isResponseJsonCall(node)) mixedRawResponse = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return {
    endpointImports,
    apiResponseCalls,
    mixedRawResponse,
    retainsResponsePin: /\bsatisfies\b/.test(source),
  };
}

interface DeclaredEndpoint {
  /** The exported binding name callers and routes import. */
  name: string;
  method: string;
  path: string;
  /** Repo-relative contract module that declares it. */
  contract: string;
}

function stringProperty(literal: ts.ObjectLiteralExpression, key: string): string | undefined {
  for (const property of literal.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === key &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      return property.initializer.text;
    }
  }
  return undefined;
}

/** Every `defineEndpoint` declaration in the repository, with its exported name. */
function collectDeclaredEndpoints(): DeclaredEndpoint[] {
  const declared: DeclaredEndpoint[] = [];
  for (const file of findFiles(SRC_DIR, (name) => name === 'api-contract.ts')) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'defineEndpoint'
      ) {
        const [argument] = node.initializer.arguments;
        if (argument !== undefined && ts.isObjectLiteralExpression(argument)) {
          const method = stringProperty(argument, 'method');
          const path = stringProperty(argument, 'path');
          if (method !== undefined && path !== undefined) {
            declared.push({ name: node.name.text, method, path, contract: relative(REPO_ROOT, file) });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return declared;
}

/**
 * An endpoint's declared path → the route file that must serve it. Template
 * segments pass through verbatim, matching `scripts/route-presence.mjs`.
 */
function routeFileForPath(path: string): string {
  return join(API_DIR, path.replace(/^\/api\/?/, ''), 'route.ts');
}

function exportsMethod(source: string, method: string): boolean {
  const file = sourceFile(source);
  for (const statement of file.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === method) return true;
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === method,
      )
    ) {
      return true;
    }
  }
  return false;
}

const DECLARED_ENDPOINTS = collectDeclaredEndpoints();

describe('route-source classifiers', () => {
  const endpointImport =
    "import { exampleEndpoint } from '@/features/example/api-contract';";
  const responseImport =
    "import { apiResponse } from '@/transport/api-response';";

  it('rejects a contractless route', () => {
    const source = 'export function GET() { return Response.json({ ok: true }); }';
    expect(hasContractImport(source)).toBe(false);
    expect(classifyV2Route(source).apiResponseCalls).toBe(0);
  });

  it('rejects mixed raw Response, NextResponse, and response pins on otherwise-valid v2 routes', () => {
    const mixedJson = classifyV2Route(`${endpointImport}
${responseImport}
apiResponse(exampleEndpoint, 200, { ok: true });
Response.json({ error: 'raw' }, { status: 400 });`);
    const mixedCtor = classifyV2Route(`${endpointImport}
${responseImport}
apiResponse(exampleEndpoint, 200, { ok: true });
new Response('x', { status: 400 });`);
    const mixedNext = classifyV2Route(`${endpointImport}
${responseImport}
import { NextResponse } from 'next/server';
apiResponse(exampleEndpoint, 200, { ok: true });
NextResponse.json({ error: 'raw' }, { status: 400 });`);
    const retainsPin = classifyV2Route(`${endpointImport}
${responseImport}
apiResponse(exampleEndpoint, 200, { ok: true } satisfies LegacyResponse);`);

    expect(mixedJson).toMatchObject({ apiResponseCalls: 1, mixedRawResponse: true });
    expect(mixedCtor).toMatchObject({ apiResponseCalls: 1, mixedRawResponse: true });
    expect(mixedNext).toMatchObject({ apiResponseCalls: 1, mixedRawResponse: true });
    expect(retainsPin).toMatchObject({ apiResponseCalls: 1, retainsResponsePin: true });
  });

  it('requires the called endpoint and apiResponse to be imported from their owners', () => {
    const localEndpoint = classifyV2Route(`${responseImport}
const exampleEndpoint = {};
apiResponse(exampleEndpoint, 200, { ok: true });`);
    const localResponse = classifyV2Route(`${endpointImport}
function apiResponse() {}
apiResponse(exampleEndpoint, 200, { ok: true });`);
    expect(localEndpoint.apiResponseCalls).toBe(0);
    expect(localResponse.apiResponseCalls).toBe(0);
  });

  it('accepts aliases for both imported v2 bindings', () => {
    const result = classifyV2Route(`
import { exampleEndpoint as endpoint } from '@/features/example/api-contract';
import { apiResponse as respond } from '@/transport/api-response';
respond(endpoint, 200, { ok: true });`);
    expect(result.endpointImports).toEqual(new Set(['endpoint']));
    expect(result.apiResponseCalls).toBe(1);
  });
});

describe('API route inventories', () => {
  it.each(FIRST_PARTY_ROUTE_FILES)('%s has one truthful input classification', (file) => {
    const source = readFileSync(file, 'utf8');
    const markers = inputMarkers(source);
    const consumesSchema = hasSchemaConsumption(source);
    expect(
      hasContractImport(source),
      `${relative(REPO_ROOT, file)} does not import its owning api-contract module`,
    ).toBe(true);
    expect(
      markers.length > 0 || consumesSchema,
      `${relative(REPO_ROOT, file)} has neither body-schema consumption nor an input marker`,
    ).toBe(true);
    expect(markers.length).toBeLessThan(2);
    if (markers[0] !== undefined) expect(VALID_INPUT_CLASSES.has(markers[0])).toBe(true);
    expect(consumesSchema && markers.length > 0).toBe(false);
  });

  it.each(V2_ROUTE_FILES)('%s is bound to an imported v2 endpoint', (file) => {
    const result = classifyV2Route(readFileSync(file, 'utf8'));
    expect(
      result.endpointImports.size,
      `${relative(REPO_ROOT, file)} imports no endpoint contract`,
    ).toBeGreaterThan(0);
    expect(
      result.apiResponseCalls,
      `${relative(REPO_ROOT, file)} does not call imported apiResponse with an imported endpoint`,
    ).toBeGreaterThan(0);
    expect(result.mixedRawResponse).toBe(false);
    expect(result.retainsResponsePin).toBe(false);
  });

  it.each([...FORM_ROUTES])('%s keeps redirects but constructs no ad-hoc error response', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');
    expect(source).not.toMatch(/\bnew\s+Response\s*\(/);
    expect(source).not.toMatch(/\bResponse\.json\s*\(/);
  });
});

// Route → contract association proves every route has an owner. This is the
// other direction: every declared contract must be served by a real route file
// that imports it and exports its method, so an endpoint whose route was
// renamed or deleted fails instead of lingering as an orphan.
describe('endpoint → route association', () => {
  it.each(DECLARED_ENDPOINTS.map((endpoint) => [endpoint.name, endpoint] as const))(
    '%s is served by the route file its path derives',
    (_name, endpoint) => {
      const file = routeFileForPath(endpoint.path);
      expect(
        existsSync(file),
        `${endpoint.contract}:${endpoint.name} declares ${endpoint.path} but ${relative(REPO_ROOT, file)} does not exist`,
      ).toBe(true);

      const source = readFileSync(file, 'utf8');
      const imported = namedImports(sourceFile(source), (moduleName) =>
        moduleName.endsWith('api-contract'),
      );
      expect(
        [...imported.values()].includes(endpoint.name),
        `${relative(REPO_ROOT, file)} does not import ${endpoint.name}`,
      ).toBe(true);
      expect(
        exportsMethod(source, endpoint.method),
        `${relative(REPO_ROOT, file)} does not export ${endpoint.method}`,
      ).toBe(true);
    },
  );
});

describe('association gate red fixtures', () => {
  it('derives route files from static and templated paths and flags a missing derived file', () => {
    expect(relative(API_DIR, routeFileForPath('/api/sites'))).toBe(join('sites', 'route.ts'));
    expect(relative(API_DIR, routeFileForPath('/api/sites/[id]'))).toBe(
      join('sites', '[id]', 'route.ts'),
    );
    expect(existsSync(routeFileForPath('/api/does-not-exist'))).toBe(false);
  });

  it('flags missing endpoint imports, wrong methods, and undeclared input-marker classes', () => {
    const source = `import { somethingElse } from '@/features/example/api-contract';
export async function POST(): Promise<Response> { return new Response(); }`;
    const imported = namedImports(sourceFile(source), (moduleName) =>
      moduleName.endsWith('api-contract'),
    );
    expect([...imported.values()].includes('exampleEndpoint')).toBe(false);
    expect(exportsMethod(source, 'GET')).toBe(false);
    expect(exportsMethod(source, 'POST')).toBe(true);
    expect(exportsMethod('export const GET = handler;', 'GET')).toBe(true);
    expect(exportsMethod('const GET = handler;', 'GET')).toBe(false);
    expect(inputMarkers('// input: path')).toEqual(['path']);
    expect(VALID_INPUT_CLASSES.has('path')).toBe(true);
    expect(VALID_INPUT_CLASSES.has('body')).toBe(false);
    expect(inputMarkers('// input: none\n// input: query')).toHaveLength(2);
  });
});
